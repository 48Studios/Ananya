import { apiClient } from "../api-client";

export interface SecurityAuditLogDto {
  id: string;
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  category: string;
  ipAddress?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
}

export const auditApi = {
  getLogs: (
    category?: string,
    userId?: string,
  ): Promise<SecurityAuditLogDto[]> => {
    const params = new URLSearchParams();
    if (category) params.append("category", category);
    if (userId) params.append("userId", userId);

    const qs = params.toString();
    const url = qs ? `/security/audit?${qs}` : "/security/audit";
    return apiClient.get<SecurityAuditLogDto[]>(url);
  },
};
