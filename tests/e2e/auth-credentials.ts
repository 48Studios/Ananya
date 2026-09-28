export const e2eAdminCredentials =
  process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD
    ? {
        email: process.env.E2E_ADMIN_EMAIL,
        password: process.env.E2E_ADMIN_PASSWORD,
      }
    : undefined;
