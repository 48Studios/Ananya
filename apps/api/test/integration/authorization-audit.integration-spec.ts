import { Test } from '@nestjs/testing';
import { ModulesContainer } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { AppModule } from '../../src/app.module';

/**
 * Known and audited mutation endpoints that enforce authorization
 * within their handler rather than via route-level guards.
 *
 * Each of these MUST be documented with its security mechanism:
 * - Dynamic entity dispatch (evaluates specific permissions inside handler)
 * - Self-service identity binding (strictly bound to req.user.id)
 */
const AUDITED_HANDLER_LEVEL_MUTATIONS: Record<string, string[]> = {
  // Dynamic per-entity RBAC partitioning (SEC-19): User -> Administration.Users, PO -> PurchaseOrders.Update, etc.
  ImportExportController: ['previewImport', 'executeImport'],
  // Dynamic per-entity RBAC partitioning (SEC-20): Role -> Administration.Roles, Component -> Inventory.Delete, fails closed.
  BulkActionsController: ['executeBulkAction'],
  // Authenticated actor self-service: revokes caller's own token or changes own password
  AuthController: ['logout', 'changePassword'],
  // Sequential numbering generation for document creation
  SettingsController: ['generateDocumentCode'],
  // Scoped to req.user.id with manager permission checks for cross-user actions & approvals (SEC-17)
  TimeEntriesController: ['create', 'approve', 'reject'],
  // Scoped strictly to req.user.id (SEC-14)
  NotificationsController: ['markAsRead', 'markAllAsRead', 'updatePreferences'],
  // Scoped strictly to req.user.id (SEC-13)
  PreferencesController: [
    'updateDashboardLayout',
    'createSavedView',
    'addFavorite',
    'removeFavorite',
    'updateWorkspacePreferences',
  ],
};

describe('Automated Authorization Completeness Audit (Phase 3.5)', () => {
  let modulesContainer: ModulesContainer;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    modulesContainer = moduleRef.get(ModulesContainer);
  });

  it('ensures every HTTP mutation (POST, PUT, PATCH, DELETE) has an explicit authorization decision', () => {
    const mutationMethods = [
      RequestMethod.POST,
      RequestMethod.PUT,
      RequestMethod.PATCH,
      RequestMethod.DELETE,
    ];

    const unhandledMutations: Array<{
      controller: string;
      method: string;
      httpMethod: string;
      path: string;
    }> = [];

    let totalMutationsChecked = 0;
    let guardedMutations = 0;
    let publicMutations = 0;
    let auditedHandlerMutations = 0;

    for (const module of modulesContainer.values()) {
      for (const controller of module.controllers.values()) {
        const controllerClass = controller.metatype;
        if (!controllerClass || !controllerClass.prototype) continue;

        const classGuards = Reflect.getMetadata('__guards__', controllerClass) || [];
        const classIsPublic = Reflect.getMetadata('isPublic', controllerClass) === true;

        const prototype = controllerClass.prototype;
        const methodNames = Object.getOwnPropertyNames(prototype).filter(
          (m) => m !== 'constructor',
        );

        for (const methodName of methodNames) {
          const handler = prototype[methodName];
          if (typeof handler !== 'function') continue;

          const requestMethod = Reflect.getMetadata('method', handler);
          if (
            requestMethod === undefined ||
            !mutationMethods.includes(requestMethod)
          ) {
            continue;
          }

          totalMutationsChecked++;
          const methodPath = Reflect.getMetadata('path', handler);
          const methodGuards = Reflect.getMetadata('__guards__', handler) || [];
          const methodIsPublic = Reflect.getMetadata('isPublic', handler) === true;

          const hasGuard = classGuards.length > 0 || methodGuards.length > 0;
          const isPublic = classIsPublic || methodIsPublic;
          const isAuditedHandlerLevel =
            AUDITED_HANDLER_LEVEL_MUTATIONS[controllerClass.name]?.includes(
              methodName,
            ) ?? false;

          if (hasGuard) {
            guardedMutations++;
          } else if (isPublic) {
            publicMutations++;
          } else if (isAuditedHandlerLevel) {
            auditedHandlerMutations++;
          } else {
            unhandledMutations.push({
              controller: controllerClass.name,
              method: methodName,
              httpMethod: RequestMethod[requestMethod] ?? 'UNKNOWN',
              path: methodPath,
            });
          }
        }
      }
    }

    // Report stats
    console.log('\n--- Authorization Completeness Audit Summary ---');
    console.log(`Total HTTP mutations inspected: ${totalMutationsChecked}`);
    console.log(`  Route / Class Guarded:        ${guardedMutations}`);
    console.log(`  Public (Explicit Opt-out):    ${publicMutations}`);
    console.log(`  Audited Handler/Self-service: ${auditedHandlerMutations}`);
    console.log(`  Unguarded / Unhandled:        ${unhandledMutations.length}`);
    console.log('------------------------------------------------\n');

    expect(unhandledMutations).toEqual([]);
    expect(totalMutationsChecked).toBeGreaterThan(150);
  });
});
