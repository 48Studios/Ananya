import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { closeDatabaseConnection, db } from '@ananya/database';
import { emailTemplates, securityAuditLogs } from '@ananya/database/schema';
import { and, eq, inArray } from '@ananya/database/query';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { EmailTemplatesSeedService } from '../../src/email-templates/email-templates.seed';
import { INVENTORY_EVENT_TYPES } from '../../src/email-templates/template-registry';
import {
  MailService,
  MAIL_CONFIG,
  MAIL_CONFIG_ERRORS,
  MAIL_TRANSPORT,
} from '../../src/mail/mail.service';
import type { MailConfig } from '../../src/mail/mail.config';
import type {
  MailMessage,
  MailSendResult,
  MailTransport,
} from '../../src/mail/mail.types';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { FixtureOwner } from '../fixtures/fixture-owner';

class FakeMailTransport implements MailTransport {
  readonly name = 'fake';
  readonly captured: MailMessage[] = [];
  private rejectAll = false;

  reject(): void {
    this.rejectAll = true;
  }

  accept(): void {
    this.rejectAll = false;
  }

  send(message: MailMessage): Promise<MailSendResult> {
    if (this.rejectAll) {
      return Promise.resolve({
        accepted: false,
        error: 'SMTP auth failed for smtp://mailer:super-secret@smtp.invalid',
      });
    }
    this.captured.push(message);
    return Promise.resolve({
      accepted: true,
      providerMessageId: 'fake-template-test',
    });
  }

  verify(): Promise<{ ok: boolean; error?: string }> {
    return Promise.resolve({ ok: true });
  }
}

const TEST_MAIL_CONFIG: MailConfig = {
  enabled: true,
  transport: 'log',
  from: 'alerts@ananya.test',
  maxAttempts: 2,
  smtp: { host: '', port: 587, secure: false, timeoutMs: 10000 },
};

describe('Email templates API', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const owner = new FixtureOwner('email-tpl');

  let app: INestApplication;
  let transport: FakeMailTransport;
  let adminToken = '';
  let readerToken = '';
  let adminUserId = '';
  let adminEmail = '';
  let seedService: EmailTemplatesSeedService;
  let mailService: MailService;
  let originalLowStockTemplate: {
    subject: string;
    bodyHtml: string;
    bodyText: string;
    isEnabled: boolean;
    version: number;
  } | null = null;
  const trackedUserIds: string[] = [];

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function admin() {
    return { Authorization: `Bearer ${adminToken}` };
  }

  function reader() {
    return { Authorization: `Bearer ${readerToken}` };
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;

    transport = new FakeMailTransport();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(transport)
      .overrideProvider(MAIL_CONFIG)
      .useValue(TEST_MAIL_CONFIG)
      .overrideProvider(MAIL_CONFIG_ERRORS)
      .useValue([])
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const authService = app.get(AuthService);
    const rolesService = app.get(RolesService);
    const usersService = app.get(UsersService);
    seedService = app.get(EmailTemplatesSeedService);
    mailService = app.get(MailService);

    const adminRole = await owner.createRole(rolesService, [
      'Administration.Settings',
    ]);
    const readerRole = await owner.createRole(rolesService, ['Inventory.Read']);
    const admin = await owner.createUser(
      usersService,
      adminRole.id,
      'tpl-admin',
    );
    const reader = await owner.createUser(
      usersService,
      readerRole.id,
      'tpl-reader',
    );
    trackedUserIds.push(admin.id, reader.id);
    adminUserId = admin.id;
    adminEmail = admin.email;

    adminToken = (await authService.createSessionForUser(admin.id)).token;
    readerToken = (await authService.createSessionForUser(reader.id)).token;

    const [existing] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.eventType, INVENTORY_EVENT_TYPES.LOW_STOCK));
    if (existing) {
      originalLowStockTemplate = {
        subject: existing.subject,
        bodyHtml: existing.bodyHtml,
        bodyText: existing.bodyText,
        isEnabled: existing.isEnabled,
        version: existing.version,
      };
    }
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    // Restore the shared template row exactly as found: the seed deliberately
    // never overwrites templates, so a test edit would otherwise persist.
    if (originalLowStockTemplate) {
      await db
        .update(emailTemplates)
        .set({
          subject: originalLowStockTemplate.subject,
          bodyHtml: originalLowStockTemplate.bodyHtml,
          bodyText: originalLowStockTemplate.bodyText,
          isEnabled: originalLowStockTemplate.isEnabled,
          version: originalLowStockTemplate.version,
          updatedAt: new Date(),
        })
        .where(eq(emailTemplates.eventType, INVENTORY_EVENT_TYPES.LOW_STOCK));
    }

    if (trackedUserIds.length > 0) {
      await db
        .delete(securityAuditLogs)
        .where(inArray(securityAuditLogs.userId, trackedUserIds));
    }

    await owner.cleanup();
    if (app) await app.close();
    await closeDatabaseConnection();
  });

  it('rejects anonymous and unauthorized template access', async () => {
    if (!hasDbUrl) return;

    expect((await http().get('/email-templates')).status).toBe(401);
    expect((await http().get('/email-templates').set(reader())).status).toBe(
      403,
    );
    expect(
      (
        await http()
          .put(`/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}`)
          .set(reader())
          .send({
            subject: 'hijack',
            bodyHtml: '<p>hijack</p>',
            bodyText: 'hijack',
          })
      ).status,
    ).toBe(403);
    expect(
      (
        await http()
          .post(
            `/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}/restore-default`,
          )
          .set(reader())
      ).status,
    ).toBe(403);
    expect(
      (
        await http()
          .post(`/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}/preview`)
          .set(reader())
          .send({
            subject: 'x',
            bodyHtml: '<p>x</p>',
            bodyText: 'x',
          })
      ).status,
    ).toBe(403);
    expect(
      (
        await http()
          .post(`/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}/test-send`)
          .set(reader())
          .send({})
      ).status,
    ).toBe(403);
  });

  it('lists every supported event with its default template', async () => {
    if (!hasDbUrl) return;

    const response = await http().get('/email-templates').set(admin());
    expect(response.status).toBe(200);

    const eventTypes = (response.body as Array<{ eventType: string }>).map(
      (row) => row.eventType,
    );
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        INVENTORY_EVENT_TYPES.LOW_STOCK,
        INVENTORY_EVENT_TYPES.OUT_OF_STOCK,
        INVENTORY_EVENT_TYPES.STOCK_RECOVERED,
      ]),
    );
  });

  it('exposes the per-event variable reference', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .get('/email-templates/variables')
      .set(admin());
    expect(response.status).toBe(200);

    const registry = response.body as Array<{
      eventType: string;
      variables: Array<{ name: string; description: string; example: string }>;
      sampleContext: Record<string, string>;
    }>;

    const lowStock = registry.find(
      (entry) => entry.eventType === INVENTORY_EVENT_TYPES.LOW_STOCK,
    );
    expect(lowStock).toBeDefined();
    expect(lowStock!.variables.map((variable) => variable.name)).toEqual(
      expect.arrayContaining([
        'component_sku',
        'quantity_available',
        'reorder_point',
        'alert_url',
      ]),
    );
    for (const variable of lowStock!.variables) {
      expect(variable.description.length).toBeGreaterThan(0);
      expect(variable.example.length).toBeGreaterThan(0);
    }
  });

  it('updates a template, validates variables and enforces version checks', async () => {
    if (!hasDbUrl) return;

    const current = await http()
      .get(`/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}`)
      .set(admin());
    const currentVersion = (current.body as { version: number }).version;

    const invalid = await http()
      .put(`/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}`)
      .set(admin())
      .send({
        subject: 'Hello {{not_allowed}}',
        bodyHtml: '<p>ok</p>',
        bodyText: 'ok',
        expectedVersion: currentVersion,
      });
    expect(invalid.status).toBe(400);
    expect((invalid.body as { message: string }).message).toContain(
      'not_allowed',
    );

    const updated = await http()
      .put(`/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}`)
      .set(admin())
      .send({
        subject: 'Custom low stock {{component_sku}}',
        bodyHtml: '<p>{{component_name}} needs attention.</p>',
        bodyText: '{{component_name}} needs attention.',
        isEnabled: true,
        expectedVersion: currentVersion,
      });
    expect(updated.status).toBe(200);
    expect((updated.body as { subject: string }).subject).toBe(
      'Custom low stock {{component_sku}}',
    );
    expect((updated.body as { version: number }).version).toBe(
      currentVersion + 1,
    );

    const stale = await http()
      .put(`/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}`)
      .set(admin())
      .send({
        subject: 'Stale write',
        bodyHtml: '<p>stale</p>',
        bodyText: 'stale',
        expectedVersion: currentVersion,
      });
    expect(stale.status).toBe(409);
  });

  it('records an audit entry for template changes', async () => {
    if (!hasDbUrl) return;

    const rows = await db
      .select()
      .from(securityAuditLogs)
      .where(
        and(
          eq(securityAuditLogs.userId, adminUserId),
          eq(securityAuditLogs.action, 'EMAIL_TEMPLATE_UPDATED'),
        ),
      );

    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('previews the saved template with server-side sample data', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .post(`/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}/preview`)
      .set(admin())
      .send({
        subject: 'Preview {{component_sku}}',
        bodyHtml: '<p>{{component_name}} at {{quantity_available}}</p>',
        bodyText: '{{component_name}} at {{quantity_available}}',
      });

    expect(response.status).toBe(200);
    const preview = response.body as {
      subject: string;
      html: string;
      text: string;
    };
    expect(preview.subject).toContain('MCU-ESP32-01');
    expect(preview.html).toContain('ESP32-WROOM-32E');
    expect(preview.html).not.toContain('{{');
    expect(preview.html).not.toContain('undefined');
  });

  it('sends a test email only to the authenticated administrator', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .post(`/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}/test-send`)
      .set(admin())
      .send({});

    expect(response.status).toBe(201);
    expect((response.body as { accepted: boolean }).accepted).toBe(true);
    expect((response.body as { recipient: string }).recipient).toBe(adminEmail);

    const lastMessage = transport.captured[transport.captured.length - 1];
    expect(lastMessage?.to).toBe(adminEmail);
    expect(lastMessage?.subject.startsWith('[TEST]')).toBe(true);
    expect(lastMessage?.html).not.toContain('{{');
  });

  it('reports a failed test-send without leaking credentials', async () => {
    if (!hasDbUrl) return;

    transport.reject();
    try {
      const response = await http()
        .post(`/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}/test-send`)
        .set(admin())
        .send({});

      expect(response.status).toBe(400);
      const message = JSON.stringify(response.body);
      expect(message).not.toContain('super-secret');
      expect(message).toContain('[REDACTED]');
    } finally {
      transport.accept();
    }
  });

  it('restores the default template and preserves the custom version history', async () => {
    if (!hasDbUrl) return;

    const response = await http()
      .post(
        `/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}/restore-default`,
      )
      .set(admin());

    expect(response.status).toBe(201);
    const restored = response.body as { subject: string; version: number };
    expect(restored.subject).toContain('Low stock: {{component_sku}}');
    expect(restored.version).toBeGreaterThanOrEqual(3);
  });

  it('re-seeding never overwrites an edited template', async () => {
    if (!hasDbUrl) return;

    const customSubject = 'Operator edited subject {{component_sku}}';
    const current = await http()
      .get(`/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}`)
      .set(admin());
    const version = (current.body as { version: number }).version;

    const updated = await http()
      .put(`/email-templates/${INVENTORY_EVENT_TYPES.LOW_STOCK}`)
      .set(admin())
      .send({
        subject: customSubject,
        bodyHtml: '<p>{{component_name}}</p>',
        bodyText: '{{component_name}}',
        expectedVersion: version,
      });
    expect(updated.status).toBe(200);

    const inserted = await seedService.seedDefaults();
    expect(inserted).toBe(0);

    const [row] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.eventType, INVENTORY_EVENT_TYPES.LOW_STOCK));
    expect(row?.subject).toBe(customSubject);
  });

  it('reports mail readiness and outbox status without secrets', async () => {
    if (!hasDbUrl) return;

    const status = await http().get('/mail/status').set(admin());
    expect(status.status).toBe(200);
    const body = status.body as {
      enabled: boolean;
      transport: string;
      from: string;
      configErrors: string[];
    };
    expect(body.enabled).toBe(true);
    expect(body.transport).toBe('fake');
    expect(body.from).toBe('alerts@ananya.test');
    expect(JSON.stringify(body)).not.toContain('super-secret');

    expect((await http().get('/mail/outbox').set(admin())).status).toBe(200);
    expect((await http().get('/mail/outbox/counts').set(admin())).status).toBe(
      200,
    );
    expect((await http().get('/mail/status').set(reader())).status).toBe(403);
  });

  it('verifies the configured transport through the admin endpoint', async () => {
    if (!hasDbUrl) return;

    const response = await http().post('/mail/verify').set(admin());

    expect(response.status).toBe(201);
    expect((response.body as { ok: boolean }).ok).toBe(true);
    expect(mailService.isEnabled()).toBe(true);
  });
});
