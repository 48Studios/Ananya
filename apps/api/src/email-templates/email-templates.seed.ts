import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { db } from '@ananya/database';
import { emailTemplates } from '@ananya/database/schema';
import { EMAIL_EVENT_DEFINITIONS } from './template-registry';

/**
 * Seeds default templates for every supported event type.
 *
 * `ON CONFLICT (event_type) DO NOTHING` makes this idempotent and guarantees a
 * restart or deploy never overwrites a template an administrator has edited.
 */
@Injectable()
export class EmailTemplatesSeedService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplatesSeedService.name);

  async onModuleInit(): Promise<void> {
    const inserted = await this.seedDefaults();
    if (inserted > 0) {
      this.logger.log(
        `Seeded ${inserted} default email template(s); existing templates were left untouched.`,
      );
    }
  }

  async seedDefaults(): Promise<number> {
    let inserted = 0;

    for (const definition of EMAIL_EVENT_DEFINITIONS) {
      const rows = await db
        .insert(emailTemplates)
        .values({
          eventType: definition.eventType,
          category: definition.category,
          name: definition.name,
          description: definition.description,
          subject: definition.defaultSubject,
          bodyHtml: definition.defaultBodyHtml,
          bodyText: definition.defaultBodyText,
          isEnabled: true,
        })
        .onConflictDoNothing({ target: emailTemplates.eventType })
        .returning({ id: emailTemplates.id });

      inserted += rows.length;
    }

    return inserted;
  }
}
