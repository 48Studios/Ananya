import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: varchar("description", { length: 500 }),
    isSystem: boolean("is_system").notNull().default(false),
    permissions: jsonb("permissions").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("roles_name_unique").on(table.name),
    index("roles_is_system_idx").on(table.isSystem),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    department: varchar("department", { length: 100 }),
    roleId: uuid("role_id").references(() => roles.id, {
      onDelete: "set null",
    }),
    secondaryRoleIds: jsonb("secondary_role_ids").default([]),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_role_id_idx").on(table.roleId),
    index("users_status_idx").on(table.status),
  ],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 500 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 500 }),
    deviceInfo: varchar("device_info", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    isRevoked: boolean("is_revoked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_sessions_token_unique").on(table.token),
    index("user_sessions_user_id_idx").on(table.userId),
    index("user_sessions_is_revoked_idx").on(table.isRevoked),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    isUsed: boolean("is_used").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_token_unique").on(table.token),
    index("password_reset_tokens_user_id_idx").on(table.userId),
  ],
);

export const securityAuditLogs = pgTable(
  "security_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    userEmail: varchar("user_email", { length: 255 }),
    action: varchar("action", { length: 100 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("security_audit_logs_user_id_idx").on(table.userId),
    index("security_audit_logs_action_idx").on(table.action),
    index("security_audit_logs_category_idx").on(table.category),
    index("security_audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export const userInvitations = pgTable(
  "user_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    department: varchar("department", { length: 100 }),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"), // 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'
    invitedById: uuid("invited_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_invitations_token_unique").on(table.token),
    index("user_invitations_email_idx").on(table.email),
    index("user_invitations_status_idx").on(table.status),
  ],
);

export const organizationSetupStatus = pgTable("organization_setup_status", {
  id: uuid("id").defaultRandom().primaryKey(),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedById: uuid("completed_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export type SecurityAuditLog = typeof securityAuditLogs.$inferSelect;
export type NewSecurityAuditLog = typeof securityAuditLogs.$inferInsert;

export type UserInvitation = typeof userInvitations.$inferSelect;
export type OrganizationSetupStatus =
  typeof organizationSetupStatus.$inferSelect;
