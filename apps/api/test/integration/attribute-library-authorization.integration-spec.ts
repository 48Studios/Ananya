import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { RolesService } from '../../src/roles/roles.service';
import { UsersService } from '../../src/users/users.service';
import { AttributesService } from '../../src/attributes/attributes.service';
import type { CreateAttributeDefinitionDto } from '../../src/attributes/dtos/create-attribute-definition.dto';
import { CategoriesService } from '../../src/categories/categories.service';
import { closeDatabaseConnection } from '@ananya/database';
import { FixtureOwner } from '../fixtures/fixture-owner';

/**
 * Attribute library API — authorization (Pass 6C).
 *
 * `AttributesController` had **no guards on any of its 17 routes**: anonymous
 * callers could create, rename, deactivate and hard-delete attribute
 * definitions, bind and unbind categories, add and remove options, and write or
 * erase component attribute values.
 *
 * The routes are not peripheral to intelligence. `POST
 * /attributes/:id/categories` and `DELETE /attributes/:id/categories/:categoryId`
 * are the *same* category-binding mutation that the guarded
 * `POST /ml/attributes/review-queue/:id/apply` performs, so a guard on the
 * intelligence route was a boundary for one caller rather than for the mutation.
 * These are HTTP tests, so they prove the guard is attached to the route.
 *
 * Four identities, matching `component-api-security.integration-spec.ts`:
 *
 *  - **anonymous** — no token at all
 *  - **reader** — `Inventory.Read` only
 *  - **writer** — `Inventory.Read` + `Inventory.Update`
 *  - **deleter** — `Inventory.Read` + `Inventory.Delete`
 *
 * The delete boundary is tested separately on purpose: deleting a definition is a
 * cascading hard delete (bindings, options and recorded component attribute
 * values are removed by the database), so it requires `Inventory.Delete`, which
 * no system role except `Administrator` holds. A writer deliberately does NOT
 * pass it.
 *
 * Every refusal is also asserted to have left no row behind, so the boundary is
 * "the mutation did not happen" rather than merely "the response was a 403".
 */
describe('Attribute library — authorization', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);

  let app: INestApplication;
  let authService: AuthService;
  let rolesService: RolesService;
  let usersService: UsersService;
  let attributesService: AttributesService;
  let categoriesService: CategoriesService;

  const owner = new FixtureOwner('attr-auth');

  let readerToken = '';
  let writerToken = '';
  let deleterToken = '';

  function http() {
    return request(app.getHttpServer() as Parameters<typeof request>[0]);
  }

  function definitionPayload(suffix: string) {
    return {
      code: owner.code(`atauth${suffix}`),
      name: owner.name(`Auth ${suffix}`),
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      defaultUnit: 'ohm',
    };
  }

  /**
   * Creates and tracks an attribute-definition fixture.
   *
   * `FixtureOwner.createAttributeDefinition` is typed structurally against a loose
   * `Record<string, unknown>` payload so the helper does not depend on the module
   * that uses it, and a concretely-typed service method cannot satisfy that
   * signature (parameter contravariance). This adapter passes the real service
   * through while keeping the owner's ownership contract.
   */
  function createAttribute(prefix: string) {
    return owner.createAttributeDefinition(
      {
        createDefinition: (input: Record<string, unknown>) =>
          attributesService.createDefinition(
            input as unknown as CreateAttributeDefinitionDto,
          ),
      },
      {},
      prefix,
    );
  }

  /** Whether a definition still exists, read through the service (guard-free). */
  async function definitionExists(id: string): Promise<boolean> {
    try {
      await attributesService.getDefinitionById(id);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Adopts a definition that was created over HTTP, so cleanup can see it.
   *
   * A refused request must create nothing, so the tracking has to happen
   * unconditionally rather than after the status assertion: if the guard is ever
   * removed, the request succeeds and the fixture would otherwise leak — which is
   * exactly what happened when this suite was first run against the unguarded
   * controller to prove the assertions can fail.
   */
  async function adoptDefinitionByCode(code: string): Promise<string | null> {
    const definitions = await attributesService.getAllDefinitions();
    const created = definitions.find((definition) => definition.code === code);
    if (!created) return null;
    owner.trackAttributeDefinition(created.id);
    return created.id;
  }

  /** Whether a category binding exists, read through the service (guard-free). */
  async function bindingExists(
    attributeDefinitionId: string,
    categoryId: string,
  ): Promise<boolean> {
    const bindings = await attributesService.getAttributeCategories(
      attributeDefinitionId,
    );
    return bindings.some((binding) => binding.categoryId === categoryId);
  }

  beforeAll(async () => {
    if (!hasDbUrl) return;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts, so whitelist rejection behaves as it does in production.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    authService = app.get(AuthService);
    rolesService = app.get(RolesService);
    usersService = app.get(UsersService);
    attributesService = app.get(AttributesService);
    categoriesService = app.get(CategoriesService);

    const readerRole = await owner.createRole(rolesService, ['Inventory.Read']);
    const writerRole = await owner.createRole(rolesService, [
      'Inventory.Read',
      'Inventory.Update',
    ]);
    const deleterRole = await owner.createRole(rolesService, [
      'Inventory.Read',
      'Inventory.Delete',
    ]);

    const reader = await owner.createUser(
      usersService,
      readerRole.id,
      'atauth-r',
    );
    const writer = await owner.createUser(
      usersService,
      writerRole.id,
      'atauth-w',
    );
    const deleter = await owner.createUser(
      usersService,
      deleterRole.id,
      'atauth-d',
    );

    readerToken = (await authService.createSessionForUser(reader.id)).token;
    writerToken = (await authService.createSessionForUser(writer.id)).token;
    deleterToken = (await authService.createSessionForUser(deleter.id)).token;
  });

  afterAll(async () => {
    if (!hasDbUrl) return;
    await owner.cleanup();
    if (app) await app.close();
    await closeDatabaseConnection();
  });

  // -------------------------------------------------------------------------
  // Anonymous
  // -------------------------------------------------------------------------

  describe('anonymous callers', () => {
    it('cannot read the attribute library', async () => {
      expect((await http().get('/attributes')).status).toBe(401);
    });

    it('cannot create an attribute definition, and creates nothing', async () => {
      const payload = definitionPayload('anon');
      const response = await http().post('/attributes').send(payload);

      // The normalized code the domain would store, so the lookup below works
      // whether or not the request was allowed through.
      const storedCode = payload.code.toLowerCase().replace(/[\s-]+/g, '_');
      const adopted = await adoptDefinitionByCode(storedCode);

      expect(response.status).toBe(401);
      expect(adopted).toBeNull();
    });

    it('cannot mutate a binding', async () => {
      const definition = await createAttribute('atauth_anonbind');
      const category = await owner.createCategory(categoriesService);

      const bind = await http()
        .post(`/attributes/${definition.id}/categories`)
        .send({ categoryId: category.id });
      expect(bind.status).toBe(401);

      const unbind = await http().delete(
        `/attributes/${definition.id}/categories/${category.id}`,
      );
      expect(unbind.status).toBe(401);

      expect(await bindingExists(definition.id, category.id)).toBe(false);
    });

    it('cannot delete an attribute definition, and it survives', async () => {
      const definition = await createAttribute('atauth_anondel');

      const response = await http().delete(`/attributes/${definition.id}`);

      expect(response.status).toBe(401);
      expect(await definitionExists(definition.id)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Read-only
  // -------------------------------------------------------------------------

  describe('read-only callers', () => {
    it('can read the library they are permitted to see', async () => {
      const response = await http()
        .get('/attributes')
        .set('Authorization', `Bearer ${readerToken}`);

      expect(response.status).toBe(200);
    });

    it('cannot create a definition, and creates nothing', async () => {
      const payload = definitionPayload('reader');
      const response = await http()
        .post('/attributes')
        .set('Authorization', `Bearer ${readerToken}`)
        .send(payload);

      const storedCode = payload.code.toLowerCase().replace(/[\s-]+/g, '_');
      const adopted = await adoptDefinitionByCode(storedCode);

      expect(response.status).toBe(403);
      expect(adopted).toBeNull();
    });

    it('cannot bind a category, and binds nothing', async () => {
      const definition = await createAttribute('atauth_readbind');
      const category = await owner.createCategory(categoriesService);

      const response = await http()
        .post(`/attributes/${definition.id}/categories`)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ categoryId: category.id });

      expect(response.status).toBe(403);
      expect(await bindingExists(definition.id, category.id)).toBe(false);
    });

    it('cannot write component attribute values', async () => {
      const definition = await createAttribute('atauth_readvalues');

      // The component id does not exist; the guard must refuse before the
      // service ever looks it up, so the status is 403 rather than 404.
      const response = await http()
        .post('/components/00000000-0000-0000-0000-000000000000/attributes')
        .set('Authorization', `Bearer ${readerToken}`)
        .send({
          attributes: [{ attributeDefinitionId: definition.id, value: 470 }],
        });

      expect(response.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Writer
  // -------------------------------------------------------------------------

  describe('writers', () => {
    it('can create a definition', async () => {
      const response = await http()
        .post('/attributes')
        .set('Authorization', `Bearer ${writerToken}`)
        .send(definitionPayload('writer'));

      expect(response.status).toBe(201);
      const created = response.body as { id: string };
      expect(created.id).toBeTruthy();
      // A definition created over HTTP is created through the service, so the
      // owner has to be told about it explicitly or cleanup cannot see it.
      owner.trackAttributeDefinition(created.id);
    });

    it('can update a definition', async () => {
      const definition = await createAttribute('atauth_writerupd');

      const response = await http()
        .put(`/attributes/${definition.id}`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ name: owner.name('Renamed') });

      expect(response.status).toBe(200);
    });

    it('can bind and unbind a category', async () => {
      const definition = await createAttribute('atauth_writerbind');
      const category = await owner.createCategory(categoriesService);

      const bind = await http()
        .post(`/attributes/${definition.id}/categories`)
        .set('Authorization', `Bearer ${writerToken}`)
        .send({ categoryId: category.id });
      expect(bind.status).toBe(201);
      expect(await bindingExists(definition.id, category.id)).toBe(true);

      const unbind = await http()
        .delete(`/attributes/${definition.id}/categories/${category.id}`)
        .set('Authorization', `Bearer ${writerToken}`);
      expect(unbind.status).toBe(200);
      expect(await bindingExists(definition.id, category.id)).toBe(false);
    });

    it('cannot delete a definition, and it survives', async () => {
      const definition = await createAttribute('atauth_writerdel');

      const response = await http()
        .delete(`/attributes/${definition.id}`)
        .set('Authorization', `Bearer ${writerToken}`);

      expect(response.status).toBe(403);
      expect(await definitionExists(definition.id)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Delete boundary
  // -------------------------------------------------------------------------

  describe('delete holders', () => {
    it('can delete a definition a writer could not', async () => {
      const definition = await createAttribute('atauth_deleter');

      const response = await http()
        .delete(`/attributes/${definition.id}`)
        .set('Authorization', `Bearer ${deleterToken}`);

      expect(response.status).toBe(200);
      expect(await definitionExists(definition.id)).toBe(false);
    });
  });
});
