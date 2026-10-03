import { apiClient } from "../api-client";

export interface EmailTemplateDto {
  id: string;
  eventType: string;
  category: string;
  name: string;
  description?: string | null;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  isEnabled: boolean;
  version: number;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVariableDto {
  name: string;
  description: string;
  example: string;
  kind?: "text" | "url" | "quantity" | "datetime";
}

export interface EmailEventDefinitionDto {
  eventType: string;
  category: string;
  name: string;
  description: string;
  variables: TemplateVariableDto[];
  sampleSubject: string;
  sampleContext: Record<string, string>;
}

export interface EmailPreviewDto {
  subject: string;
  html: string;
  text: string;
}

export interface EmailTemplateUpdateDto {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  isEnabled?: boolean;
  expectedVersion?: number;
}

export interface EmailTemplateContentDto {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export interface MailStatusDto {
  enabled: boolean;
  transport: string;
  from: string;
  replyTo?: string;
  configErrors: string[];
}

export interface EmailOutboxDto {
  id: string;
  eventType: string;
  recipientEmail: string;
  subject: string;
  status: "QUEUED" | "SENDING" | "SENT" | "FAILED" | "SKIPPED";
  attempts: number;
  maxAttempts: number;
  lastError?: string | null;
  providerMessageId?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

export const emailTemplatesApi = {
  listTemplates: (): Promise<EmailTemplateDto[]> =>
    apiClient.get<EmailTemplateDto[]>("/email-templates"),

  getVariables: (): Promise<EmailEventDefinitionDto[]> =>
    apiClient.get<EmailEventDefinitionDto[]>("/email-templates/variables"),

  getTemplate: (eventType: string): Promise<EmailTemplateDto> =>
    apiClient.get<EmailTemplateDto>(
      `/email-templates/${encodeURIComponent(eventType)}`,
    ),

  updateTemplate: (
    eventType: string,
    data: EmailTemplateUpdateDto,
  ): Promise<EmailTemplateDto> =>
    apiClient.put<EmailTemplateDto>(
      `/email-templates/${encodeURIComponent(eventType)}`,
      data,
    ),

  previewTemplate: (
    eventType: string,
    data: EmailTemplateContentDto,
  ): Promise<EmailPreviewDto> =>
    apiClient.post<EmailPreviewDto>(
      `/email-templates/${encodeURIComponent(eventType)}/preview`,
      data,
    ),

  testSend: (
    eventType: string,
    data: Partial<EmailTemplateContentDto>,
  ): Promise<{ accepted: boolean; recipient: string }> =>
    apiClient.post<{ accepted: boolean; recipient: string }>(
      `/email-templates/${encodeURIComponent(eventType)}/test-send`,
      data,
    ),

  restoreDefault: (eventType: string): Promise<EmailTemplateDto> =>
    apiClient.post<EmailTemplateDto>(
      `/email-templates/${encodeURIComponent(eventType)}/restore-default`,
      {},
    ),

  getMailStatus: (): Promise<MailStatusDto> =>
    apiClient.get<MailStatusDto>("/mail/status"),

  getOutbox: (limit = 20): Promise<EmailOutboxDto[]> =>
    apiClient.get<EmailOutboxDto[]>(`/mail/outbox?limit=${limit}`),

  getOutboxCounts: (): Promise<Record<string, number>> =>
    apiClient.get<Record<string, number>>("/mail/outbox/counts"),
};
