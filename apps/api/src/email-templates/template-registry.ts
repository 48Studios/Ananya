export interface TemplateVariableDefinition {
  name: string;
  description: string;
  example: string;
  kind?: 'text' | 'url' | 'quantity' | 'datetime';
}

export interface EmailEventDefinition {
  eventType: string;
  category: string;
  name: string;
  description: string;
  variables: TemplateVariableDefinition[];
  defaultSubject: string;
  defaultBodyHtml: string;
  defaultBodyText: string;
  sampleContext: Record<string, string>;
}

export const INVENTORY_EVENT_TYPES = {
  LOW_STOCK: 'inventory.low_stock',
  OUT_OF_STOCK: 'inventory.out_of_stock',
  STOCK_RECOVERED: 'inventory.stock_recovered',
} as const;

export type InventoryEventType =
  (typeof INVENTORY_EVENT_TYPES)[keyof typeof INVENTORY_EVENT_TYPES];

const COMPANY_VARIABLE: TemplateVariableDefinition = {
  name: 'company_name',
  description: 'Organization name from the company profile.',
  example: '48 Studios',
};

const EVENT_VARIABLE: TemplateVariableDefinition = {
  name: 'event_name',
  description: 'Human-readable name of the alert event.',
  example: 'Low stock',
};

const ITEM_VARIABLES: TemplateVariableDefinition[] = [
  {
    name: 'component_name',
    description: 'Component description.',
    example: 'ESP32-WROOM-32E',
  },
  {
    name: 'component_sku',
    description: 'Component SKU.',
    example: 'MCU-ESP32-01',
  },
  {
    name: 'location_name',
    description:
      'Component default location, or "All locations" when the component has no default.',
    example: 'Main Warehouse',
  },
];

const STOCK_VARIABLES: TemplateVariableDefinition[] = [
  {
    name: 'quantity_on_hand',
    description: 'Total on-hand quantity across all locations.',
    example: '4',
    kind: 'quantity',
  },
  {
    name: 'quantity_available',
    description: 'On-hand quantity minus active reservations.',
    example: '2',
    kind: 'quantity',
  },
  {
    name: 'reorder_point',
    description:
      'Configured minimum stock level (system settings reorder defaults).',
    example: '10',
    kind: 'quantity',
  },
  {
    name: 'shortage_quantity',
    description: 'Quantity below the reorder point (0 when not applicable).',
    example: '8',
    kind: 'quantity',
  },
];

const LINK_VARIABLES: TemplateVariableDefinition[] = [
  {
    name: 'alert_url',
    description: 'Trusted internal link to the affected component page.',
    example: '/inventory/components/00000000-0000-0000-0000-000000000000',
    kind: 'url',
  },
  {
    name: 'alerts_url',
    description: 'Trusted internal link to the inventory alerts page.',
    example: '/inventory/alerts',
    kind: 'url',
  },
  {
    name: 'occurred_at',
    description: 'UTC timestamp when the alert was detected.',
    example: '2026-10-03 14:27 UTC',
    kind: 'datetime',
  },
];

function stockTableHtml(): string {
  return `<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:14px">
  <tr><td style="color:#555">On hand</td><td style="text-align:right"><strong>{{quantity_on_hand}}</strong></td></tr>
  <tr><td style="color:#555">Available</td><td style="text-align:right"><strong>{{quantity_available}}</strong></td></tr>
  <tr><td style="color:#555">Reorder point</td><td style="text-align:right"><strong>{{reorder_point}}</strong></td></tr>
  <tr><td style="color:#555">Shortage</td><td style="text-align:right"><strong>{{shortage_quantity}}</strong></td></tr>
</table>`;
}

function stockTableText(): string {
  return `On hand: {{quantity_on_hand}}
Available: {{quantity_available}}
Reorder point: {{reorder_point}}
Shortage: {{shortage_quantity}}`;
}

export const BACKUP_EVENT_TYPES = {
  STARTED: 'backup.started',
  SUCCEEDED: 'backup.succeeded',
  FAILED: 'backup.failed',
  RETRYING: 'backup.retrying',
  EXHAUSTED_RETRIES: 'backup.exhausted_retries',
  SKIPPED: 'backup.skipped',
} as const;

export const RESTORE_EVENT_TYPES = {
  STARTED: 'restore.started',
  SUCCEEDED: 'restore.succeeded',
  FAILED: 'restore.failed',
  ABORTED: 'restore.aborted',
  SAFETY_BACKUP_SUCCEEDED: 'restore.safety_backup_succeeded',
  SAFETY_BACKUP_FAILED: 'restore.safety_backup_failed',
} as const;

const BACKUP_VARIABLES: TemplateVariableDefinition[] = [
  COMPANY_VARIABLE,
  {
    name: 'job_name',
    description: 'Name of the backup job or "Manual Backup".',
    example: 'Daily Production Backup',
  },
  {
    name: 'job_id',
    description: 'Identifier of the backup job (if scheduled).',
    example: '00000000-0000-0000-0000-000000000001',
  },
  {
    name: 'run_id',
    description: 'Identifier of the backup execution run.',
    example: '00000000-0000-0000-0000-000000000002',
  },
  {
    name: 'status',
    description: 'Execution status (STARTED, SUCCESS, FAILED, RETRYING, etc.).',
    example: 'SUCCESS',
  },
  {
    name: 'started_at',
    description: 'Timestamp when the backup began.',
    example: '2026-10-06 02:00 UTC',
    kind: 'datetime',
  },
  {
    name: 'completed_at',
    description: 'Timestamp when the backup completed.',
    example: '2026-10-06 02:03 UTC',
    kind: 'datetime',
  },
  {
    name: 'duration',
    description: 'Duration of the backup run.',
    example: '3m 12s',
  },
  {
    name: 'attempt',
    description: 'Current attempt number.',
    example: '1',
    kind: 'quantity',
  },
  {
    name: 'max_attempts',
    description: 'Configured retry attempts ceiling.',
    example: '3',
    kind: 'quantity',
  },
  {
    name: 'error',
    description: 'Failure or retry reason.',
    example: 'Database connection timed out during snapshot.',
  },
  {
    name: 'artifact_id',
    description: 'Identifier of the completed backup artifact.',
    example: '00000000-0000-0000-0000-000000000003',
  },
  {
    name: 'artifact_size',
    description: 'Human-readable byte size of the archive.',
    example: '48.2 MB',
  },
  {
    name: 'checksum',
    description: 'SHA-256 archive checksum for tamper verification.',
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  {
    name: 'actor',
    description: 'Actor or initiator of the backup.',
    example: 'Scheduler',
  },
  {
    name: 'view_url',
    description: 'Trusted internal link to backup settings/details.',
    example: '/settings/backups',
    kind: 'url',
  },
];

const RESTORE_VARIABLES: TemplateVariableDefinition[] = [
  COMPANY_VARIABLE,
  {
    name: 'operation_id',
    description: 'Unique restore operation identifier.',
    example: '00000000-0000-0000-0000-000000000010',
  },
  {
    name: 'status',
    description: 'Restore status (STARTED, SUCCESS, FAILED, ABORTED).',
    example: 'SUCCESS',
  },
  {
    name: 'started_at',
    description: 'Timestamp when restore started.',
    example: '2026-10-06 04:00 UTC',
    kind: 'datetime',
  },
  {
    name: 'completed_at',
    description: 'Timestamp when restore completed.',
    example: '2026-10-06 04:05 UTC',
    kind: 'datetime',
  },
  {
    name: 'duration',
    description: 'Duration of the restore operation.',
    example: '5m 10s',
  },
  {
    name: 'error',
    description: 'Failure reason or error message.',
    example: 'Foreign key integrity violation during table load.',
  },
  {
    name: 'artifact_id',
    description: 'Backup artifact ID used or safety backup ID.',
    example: '00000000-0000-0000-0000-000000000003',
  },
  {
    name: 'artifact_size',
    description: 'Size of the safety backup or restored artifact.',
    example: '48.2 MB',
  },
  {
    name: 'restore_scope',
    description: 'Scope of tables and documents restored.',
    example: 'Full system (all tables and documents)',
  },
  {
    name: 'conflict_policy',
    description: 'Conflict resolution policy applied (ABORT, SKIP, UPDATE).',
    example: 'ABORT',
  },
  {
    name: 'actor',
    description: 'User who authorized and executed the restore.',
    example: 'admin@48studios.com',
  },
  {
    name: 'view_url',
    description: 'Trusted internal link to restore details.',
    example: '/settings/backups',
    kind: 'url',
  },
];

const COMMON_BACKUP_SAMPLE_CONTEXT: Record<string, string> = {
  company_name: '48 Studios',
  job_name: 'Daily Production Backup',
  job_id: '00000000-0000-0000-0000-000000000001',
  run_id: '00000000-0000-0000-0000-000000000002',
  status: 'SUCCESS',
  started_at: '2026-10-06 02:00 UTC',
  completed_at: '2026-10-06 02:03 UTC',
  duration: '3m 12s',
  attempt: '1',
  max_attempts: '3',
  error: 'Database timeout',
  artifact_id: '00000000-0000-0000-0000-000000000003',
  artifact_size: '48.2 MB',
  checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  actor: 'Scheduler',
  view_url: '/settings/backups',
};

const COMMON_RESTORE_SAMPLE_CONTEXT: Record<string, string> = {
  company_name: '48 Studios',
  operation_id: '00000000-0000-0000-0000-000000000010',
  status: 'SUCCESS',
  started_at: '2026-10-06 04:00 UTC',
  completed_at: '2026-10-06 04:05 UTC',
  duration: '5m 10s',
  error: 'Foreign key integrity violation',
  artifact_id: '00000000-0000-0000-0000-000000000003',
  artifact_size: '48.2 MB',
  restore_scope: 'Full system (all tables and documents)',
  conflict_policy: 'ABORT',
  actor: 'admin@48studios.com',
  view_url: '/settings/backups',
};

const HTML_WRAPPER_OPEN =
  '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2933;line-height:1.5">';
const HTML_WRAPPER_CLOSE = '</div>';

export const EMAIL_EVENT_DEFINITIONS: EmailEventDefinition[] = [
  {
    eventType: INVENTORY_EVENT_TYPES.LOW_STOCK,
    category: 'Inventory',
    name: 'Low stock alert',
    description:
      'Sent when an active component is at or below the configured reorder point.',
    variables: [
      COMPANY_VARIABLE,
      EVENT_VARIABLE,
      ...ITEM_VARIABLES,
      ...STOCK_VARIABLES,
      ...LINK_VARIABLES,
    ],
    defaultSubject:
      'Low stock: {{component_sku}} ({{quantity_available}} available)',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px">Low stock alert</h2>
<p><strong>{{component_name}}</strong> ({{component_sku}}) is at or below its reorder point at {{location_name}}.</p>
${stockTableHtml()}
<p><a href="{{alert_url}}" style="color:#1d4ed8">Review this component in Ananya</a></p>
<p style="color:#6b7280;font-size:12px">Detected {{occurred_at}} · {{company_name}}</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `LOW STOCK ALERT

{{component_name}} ({{component_sku}}) is at or below its reorder point at {{location_name}}.

${stockTableText()}

Review this component: {{alert_url}}
All inventory alerts: {{alerts_url}}

Detected {{occurred_at}} · {{company_name}}`,
    sampleContext: {
      company_name: '48 Studios',
      event_name: 'Low stock',
      component_name: 'ESP32-WROOM-32E',
      component_sku: 'MCU-ESP32-01',
      location_name: 'Main Warehouse',
      quantity_on_hand: '4',
      quantity_available: '2',
      reorder_point: '10',
      shortage_quantity: '8',
      alert_url: '/inventory/components/00000000-0000-0000-0000-000000000000',
      alerts_url: '/inventory/alerts',
      occurred_at: '2026-10-03 14:27 UTC',
    },
  },
  {
    eventType: INVENTORY_EVENT_TYPES.OUT_OF_STOCK,
    category: 'Inventory',
    name: 'Out of stock alert',
    description: 'Sent when an active component has no on-hand quantity.',
    variables: [
      COMPANY_VARIABLE,
      EVENT_VARIABLE,
      ...ITEM_VARIABLES,
      ...STOCK_VARIABLES,
      ...LINK_VARIABLES,
    ],
    defaultSubject: 'Out of stock: {{component_sku}}',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px">Out of stock</h2>
<p><strong>{{component_name}}</strong> ({{component_sku}}) has no on-hand quantity at {{location_name}}.</p>
${stockTableHtml()}
<p><a href="{{alert_url}}" style="color:#1d4ed8">Review this component in Ananya</a></p>
<p style="color:#6b7280;font-size:12px">Detected {{occurred_at}} · {{company_name}}</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `OUT OF STOCK

{{component_name}} ({{component_sku}}) has no on-hand quantity at {{location_name}}.

${stockTableText()}

Review this component: {{alert_url}}
All inventory alerts: {{alerts_url}}

Detected {{occurred_at}} · {{company_name}}`,
    sampleContext: {
      company_name: '48 Studios',
      event_name: 'Out of stock',
      component_name: 'ESP32-WROOM-32E',
      component_sku: 'MCU-ESP32-01',
      location_name: 'Main Warehouse',
      quantity_on_hand: '0',
      quantity_available: '0',
      reorder_point: '10',
      shortage_quantity: '10',
      alert_url: '/inventory/components/00000000-0000-0000-0000-000000000000',
      alerts_url: '/inventory/alerts',
      occurred_at: '2026-10-03 14:27 UTC',
    },
  },
  {
    eventType: INVENTORY_EVENT_TYPES.STOCK_RECOVERED,
    category: 'Inventory',
    name: 'Stock recovered',
    description:
      'Sent when a previously alerted component is back above its reorder point.',
    variables: [
      COMPANY_VARIABLE,
      EVENT_VARIABLE,
      ...ITEM_VARIABLES,
      ...STOCK_VARIABLES.filter(
        (variable) => variable.name !== 'shortage_quantity',
      ),
      ...LINK_VARIABLES,
    ],
    defaultSubject:
      'Stock recovered: {{component_sku}} ({{quantity_available}} available)',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px">Stock recovered</h2>
<p><strong>{{component_name}}</strong> ({{component_sku}}) is back above its reorder point at {{location_name}}.</p>
<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:14px">
  <tr><td style="color:#555">On hand</td><td style="text-align:right"><strong>{{quantity_on_hand}}</strong></td></tr>
  <tr><td style="color:#555">Available</td><td style="text-align:right"><strong>{{quantity_available}}</strong></td></tr>
  <tr><td style="color:#555">Reorder point</td><td style="text-align:right"><strong>{{reorder_point}}</strong></td></tr>
</table>
<p><a href="{{alert_url}}" style="color:#1d4ed8">Review this component in Ananya</a></p>
<p style="color:#6b7280;font-size:12px">Resolved {{occurred_at}} · {{company_name}}</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `STOCK RECOVERED

{{component_name}} ({{component_sku}}) is back above its reorder point at {{location_name}}.

On hand: {{quantity_on_hand}}
Available: {{quantity_available}}
Reorder point: {{reorder_point}}

Review this component: {{alert_url}}
All inventory alerts: {{alerts_url}}

Resolved {{occurred_at}} · {{company_name}}`,
    sampleContext: {
      company_name: '48 Studios',
      event_name: 'Stock recovered',
      component_name: 'ESP32-WROOM-32E',
      component_sku: 'MCU-ESP32-01',
      location_name: 'Main Warehouse',
      quantity_on_hand: '25',
      quantity_available: '25',
      reorder_point: '10',
      alert_url: '/inventory/components/00000000-0000-0000-0000-000000000000',
      alerts_url: '/inventory/alerts',
      occurred_at: '2026-10-03 14:27 UTC',
    },
  },

  // ─── Backup Lifecycle Events ──────────────────────────────────────────
  {
    eventType: BACKUP_EVENT_TYPES.STARTED,
    category: 'Backup & Restore',
    name: 'Backup started',
    description: 'Sent when a scheduled or manual backup begins execution.',
    variables: BACKUP_VARIABLES.filter((v) =>
      [
        'company_name',
        'job_name',
        'job_id',
        'run_id',
        'status',
        'started_at',
        'actor',
        'view_url',
      ].includes(v.name),
    ),
    defaultSubject: 'Backup started: {{job_name}}',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px">Backup started</h2>
<p>Backup operation for <strong>{{job_name}}</strong> has started.</p>
<p style="color:#555;font-size:14px">Started at {{started_at}} by {{actor}}.</p>
<p><a href="{{view_url}}" style="color:#1d4ed8">View Backup Status</a></p>
<p style="color:#6b7280;font-size:12px">{{company_name}} Backup System</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `BACKUP STARTED

Backup operation for {{job_name}} has started.
Started at: {{started_at}}
Initiated by: {{actor}}

View status: {{view_url}}
{{company_name}} Backup System`,
    sampleContext: COMMON_BACKUP_SAMPLE_CONTEXT,
  },
  {
    eventType: BACKUP_EVENT_TYPES.SUCCEEDED,
    category: 'Backup & Restore',
    name: 'Backup succeeded',
    description:
      'Sent when a backup job finishes successfully and archive is stored.',
    variables: BACKUP_VARIABLES.filter((v) =>
      [
        'company_name',
        'job_name',
        'job_id',
        'run_id',
        'status',
        'started_at',
        'completed_at',
        'duration',
        'artifact_id',
        'artifact_size',
        'checksum',
        'actor',
        'view_url',
      ].includes(v.name),
    ),
    defaultSubject: 'Backup completed: {{job_name}} ({{artifact_size}})',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px;color:#15803d">Backup succeeded</h2>
<p>Backup for <strong>{{job_name}}</strong> completed successfully.</p>
<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:14px">
  <tr><td style="color:#555">Archive size</td><td><strong>{{artifact_size}}</strong></td></tr>
  <tr><td style="color:#555">Duration</td><td>{{duration}}</td></tr>
  <tr><td style="color:#555">Completed at</td><td>{{completed_at}}</td></tr>
  <tr><td style="color:#555">Checksum</td><td style="font-family:monospace;font-size:12px">{{checksum}}</td></tr>
</table>
<p><a href="{{view_url}}" style="color:#1d4ed8">View Backup History</a></p>
<p style="color:#6b7280;font-size:12px">{{company_name}} Backup System</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `BACKUP SUCCEEDED

Backup for {{job_name}} completed successfully.
Archive size: {{artifact_size}}
Duration: {{duration}}
Completed at: {{completed_at}}
Checksum: {{checksum}}

View history: {{view_url}}
{{company_name}} Backup System`,
    sampleContext: COMMON_BACKUP_SAMPLE_CONTEXT,
  },
  {
    eventType: BACKUP_EVENT_TYPES.FAILED,
    category: 'Backup & Restore',
    name: 'Backup failed',
    description: 'Sent when a backup job fails permanently.',
    variables: BACKUP_VARIABLES.filter((v) =>
      [
        'company_name',
        'job_name',
        'job_id',
        'run_id',
        'status',
        'started_at',
        'completed_at',
        'duration',
        'error',
        'attempt',
        'max_attempts',
        'actor',
        'view_url',
      ].includes(v.name),
    ),
    defaultSubject: 'Backup failed: {{job_name}}',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px;color:#b91c1c">Backup failed</h2>
<p>Backup for <strong>{{job_name}}</strong> encountered an error and could not complete.</p>
<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:14px">
  <tr><td style="color:#555">Error</td><td style="color:#b91c1c"><strong>{{error}}</strong></td></tr>
  <tr><td style="color:#555">Duration</td><td>{{duration}}</td></tr>
  <tr><td style="color:#555">Failed at</td><td>{{completed_at}}</td></tr>
</table>
<p><a href="{{view_url}}" style="color:#1d4ed8">Review Job Details & Logs</a></p>
<p style="color:#6b7280;font-size:12px">{{company_name}} Backup System</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `BACKUP FAILED

Backup for {{job_name}} encountered an error:
{{error}}

Duration: {{duration}}
Failed at: {{completed_at}}

Review details: {{view_url}}
{{company_name}} Backup System`,
    sampleContext: COMMON_BACKUP_SAMPLE_CONTEXT,
  },
  {
    eventType: BACKUP_EVENT_TYPES.RETRYING,
    category: 'Backup & Restore',
    name: 'Backup retrying',
    description:
      'Sent when a transient failure occurs and a retry attempt is scheduled.',
    variables: BACKUP_VARIABLES.filter((v) =>
      [
        'company_name',
        'job_name',
        'job_id',
        'run_id',
        'status',
        'started_at',
        'attempt',
        'max_attempts',
        'error',
        'actor',
        'view_url',
      ].includes(v.name),
    ),
    defaultSubject:
      'Backup retrying: {{job_name}} (attempt {{attempt}} of {{max_attempts}})',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px;color:#b45309">Backup retry scheduled</h2>
<p>Backup for <strong>{{job_name}}</strong> encountered a transient issue and will be retried (attempt {{attempt}} of {{max_attempts}}).</p>
<p style="color:#555">Reason: {{error}}</p>
<p><a href="{{view_url}}" style="color:#1d4ed8">View Backup Run</a></p>
<p style="color:#6b7280;font-size:12px">{{company_name}} Backup System</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `BACKUP RETRY SCHEDULED

Backup for {{job_name}} encountered a transient issue and will retry (attempt {{attempt}} of {{max_attempts}}).
Reason: {{error}}

View run: {{view_url}}
{{company_name}} Backup System`,
    sampleContext: COMMON_BACKUP_SAMPLE_CONTEXT,
  },
  {
    eventType: BACKUP_EVENT_TYPES.EXHAUSTED_RETRIES,
    category: 'Backup & Restore',
    name: 'Backup retries exhausted',
    description:
      'Sent when a backup job reaches its configured maximum retry attempts without success.',
    variables: BACKUP_VARIABLES.filter((v) =>
      [
        'company_name',
        'job_name',
        'job_id',
        'run_id',
        'status',
        'started_at',
        'completed_at',
        'duration',
        'attempt',
        'max_attempts',
        'error',
        'actor',
        'view_url',
      ].includes(v.name),
    ),
    defaultSubject: 'ALERT: Backup exhausted retries for {{job_name}}',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px;color:#b91c1c">Backup retries exhausted</h2>
<p>Backup job <strong>{{job_name}}</strong> failed after {{attempt}} attempts and will not be retried automatically.</p>
<p style="color:#555">Final error: <strong>{{error}}</strong></p>
<p><a href="{{view_url}}" style="color:#1d4ed8">Investigate Backup Failure</a></p>
<p style="color:#6b7280;font-size:12px">{{company_name}} Backup System</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `ALERT: BACKUP RETRIES EXHAUSTED

Backup job {{job_name}} failed after {{attempt}} attempts.
Final error: {{error}}

Investigate failure: {{view_url}}
{{company_name}} Backup System`,
    sampleContext: COMMON_BACKUP_SAMPLE_CONTEXT,
  },
  {
    eventType: BACKUP_EVENT_TYPES.SKIPPED,
    category: 'Backup & Restore',
    name: 'Backup skipped',
    description:
      'Sent when a scheduled backup is skipped due to concurrency lock or pause.',
    variables: BACKUP_VARIABLES.filter((v) =>
      [
        'company_name',
        'job_name',
        'job_id',
        'status',
        'error',
        'actor',
        'view_url',
      ].includes(v.name),
    ),
    defaultSubject: 'Backup skipped: {{job_name}}',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px">Backup run skipped</h2>
<p>Scheduled run for <strong>{{job_name}}</strong> was skipped.</p>
<p style="color:#555">Reason: {{error}}</p>
<p><a href="{{view_url}}" style="color:#1d4ed8">View Backup Jobs</a></p>
<p style="color:#6b7280;font-size:12px">{{company_name}} Backup System</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `BACKUP RUN SKIPPED

Scheduled run for {{job_name}} was skipped.
Reason: {{error}}

View jobs: {{view_url}}
{{company_name}} Backup System`,
    sampleContext: COMMON_BACKUP_SAMPLE_CONTEXT,
  },

  // ─── Restore Lifecycle Events ─────────────────────────────────────────
  {
    eventType: RESTORE_EVENT_TYPES.STARTED,
    category: 'Backup & Restore',
    name: 'Restore started',
    description: 'Sent when a database or filesystem restore begins execution.',
    variables: RESTORE_VARIABLES.filter((v) =>
      [
        'company_name',
        'operation_id',
        'status',
        'started_at',
        'artifact_id',
        'restore_scope',
        'conflict_policy',
        'actor',
        'view_url',
      ].includes(v.name),
    ),
    defaultSubject: 'Restore operation started ({{operation_id}})',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px;color:#d97706">Restore operation started</h2>
<p>A restore operation has been initiated by <strong>{{actor}}</strong>.</p>
<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:14px">
  <tr><td style="color:#555">Operation ID</td><td style="font-family:monospace">{{operation_id}}</td></tr>
  <tr><td style="color:#555">Scope</td><td>{{restore_scope}}</td></tr>
  <tr><td style="color:#555">Conflict policy</td><td>{{conflict_policy}}</td></tr>
  <tr><td style="color:#555">Started at</td><td>{{started_at}}</td></tr>
</table>
<p><a href="{{view_url}}" style="color:#1d4ed8">Monitor Restore Status</a></p>
<p style="color:#6b7280;font-size:12px">{{company_name}} Backup & Restore System</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `RESTORE OPERATION STARTED

A restore operation has been initiated by {{actor}}.
Operation ID: {{operation_id}}
Scope: {{restore_scope}}
Conflict policy: {{conflict_policy}}
Started at: {{started_at}}

Monitor status: {{view_url}}
{{company_name}} Backup & Restore System`,
    sampleContext: COMMON_RESTORE_SAMPLE_CONTEXT,
  },
  {
    eventType: RESTORE_EVENT_TYPES.SUCCEEDED,
    category: 'Backup & Restore',
    name: 'Restore succeeded',
    description: 'Sent when a restore completes successfully.',
    variables: RESTORE_VARIABLES.filter((v) =>
      [
        'company_name',
        'operation_id',
        'status',
        'started_at',
        'completed_at',
        'duration',
        'artifact_id',
        'restore_scope',
        'conflict_policy',
        'actor',
        'view_url',
      ].includes(v.name),
    ),
    defaultSubject: 'Restore succeeded ({{operation_id}})',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px;color:#15803d">Restore succeeded</h2>
<p>Restore operation <strong>{{operation_id}}</strong> finished successfully.</p>
<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:14px">
  <tr><td style="color:#555">Duration</td><td>{{duration}}</td></tr>
  <tr><td style="color:#555">Completed at</td><td>{{completed_at}}</td></tr>
  <tr><td style="color:#555">Scope restored</td><td>{{restore_scope}}</td></tr>
</table>
<p><a href="{{view_url}}" style="color:#1d4ed8">View Restore Record</a></p>
<p style="color:#6b7280;font-size:12px">{{company_name}} Backup & Restore System</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `RESTORE SUCCEEDED

Restore operation {{operation_id}} finished successfully.
Duration: {{duration}}
Completed at: {{completed_at}}
Scope: {{restore_scope}}

View record: {{view_url}}
{{company_name}} Backup & Restore System`,
    sampleContext: COMMON_RESTORE_SAMPLE_CONTEXT,
  },
  {
    eventType: RESTORE_EVENT_TYPES.FAILED,
    category: 'Backup & Restore',
    name: 'Restore failed',
    description: 'Sent when a restore operation fails or is rolled back.',
    variables: RESTORE_VARIABLES.filter((v) =>
      [
        'company_name',
        'operation_id',
        'status',
        'started_at',
        'completed_at',
        'duration',
        'error',
        'artifact_id',
        'restore_scope',
        'conflict_policy',
        'actor',
        'view_url',
      ].includes(v.name),
    ),
    defaultSubject: 'CRITICAL: Restore failed ({{operation_id}})',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px;color:#b91c1c">Restore failed</h2>
<p>Restore operation <strong>{{operation_id}}</strong> failed.</p>
<p style="color:#b91c1c"><strong>{{error}}</strong></p>
<p><a href="{{view_url}}" style="color:#1d4ed8">Inspect Recovery Information</a></p>
<p style="color:#6b7280;font-size:12px">{{company_name}} Backup & Restore System</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `CRITICAL: RESTORE FAILED

Restore operation {{operation_id}} failed.
Error: {{error}}

Inspect recovery: {{view_url}}
{{company_name}} Backup & Restore System`,
    sampleContext: COMMON_RESTORE_SAMPLE_CONTEXT,
  },
  {
    eventType: RESTORE_EVENT_TYPES.ABORTED,
    category: 'Backup & Restore',
    name: 'Restore aborted',
    description:
      'Sent when a restore operation is aborted due to conflict policy or user cancellation.',
    variables: RESTORE_VARIABLES.filter((v) =>
      [
        'company_name',
        'operation_id',
        'status',
        'started_at',
        'error',
        'artifact_id',
        'actor',
        'view_url',
      ].includes(v.name),
    ),
    defaultSubject: 'Restore aborted ({{operation_id}})',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px;color:#b45309">Restore aborted</h2>
<p>Restore operation <strong>{{operation_id}}</strong> was aborted.</p>
<p style="color:#555">Reason: {{error}}</p>
<p><a href="{{view_url}}" style="color:#1d4ed8">View Restore Details</a></p>
<p style="color:#6b7280;font-size:12px">{{company_name}} Backup & Restore System</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `RESTORE ABORTED

Restore operation {{operation_id}} was aborted.
Reason: {{error}}

View details: {{view_url}}
{{company_name}} Backup & Restore System`,
    sampleContext: COMMON_RESTORE_SAMPLE_CONTEXT,
  },
  {
    eventType: RESTORE_EVENT_TYPES.SAFETY_BACKUP_SUCCEEDED,
    category: 'Backup & Restore',
    name: 'Pre-restore safety backup created',
    description:
      'Sent when an automatic pre-restore safety snapshot is successfully created.',
    variables: RESTORE_VARIABLES.filter((v) =>
      [
        'company_name',
        'operation_id',
        'artifact_id',
        'artifact_size',
        'started_at',
        'actor',
        'view_url',
      ].includes(v.name),
    ),
    defaultSubject:
      'Pre-restore safety backup created for operation {{operation_id}}',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px;color:#15803d">Safety backup created</h2>
<p>An automatic pre-restore snapshot was created prior to modifying production state.</p>
<p style="color:#555">Safety artifact: <strong>{{artifact_id}}</strong> ({{artifact_size}})</p>
<p><a href="{{view_url}}" style="color:#1d4ed8">View Backup Artifacts</a></p>
<p style="color:#6b7280;font-size:12px">{{company_name}} Backup & Restore System</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `SAFETY BACKUP CREATED

An automatic pre-restore snapshot was created for operation {{operation_id}}.
Artifact: {{artifact_id}} ({{artifact_size}})

View artifacts: {{view_url}}
{{company_name}} Backup & Restore System`,
    sampleContext: COMMON_RESTORE_SAMPLE_CONTEXT,
  },
  {
    eventType: RESTORE_EVENT_TYPES.SAFETY_BACKUP_FAILED,
    category: 'Backup & Restore',
    name: 'Pre-restore safety backup failed',
    description:
      'Sent when creation of the automatic safety snapshot fails, aborting the restore.',
    variables: RESTORE_VARIABLES.filter((v) =>
      [
        'company_name',
        'operation_id',
        'error',
        'started_at',
        'actor',
        'view_url',
      ].includes(v.name),
    ),
    defaultSubject:
      'ALERT: Pre-restore safety backup failed for operation {{operation_id}}',
    defaultBodyHtml: `${HTML_WRAPPER_OPEN}
<h2 style="margin:0 0 12px;color:#b91c1c">Safety backup failed</h2>
<p>Creation of the pre-restore safety snapshot failed. The restore was aborted without touching production data.</p>
<p style="color:#b91c1c">Error: {{error}}</p>
<p><a href="{{view_url}}" style="color:#1d4ed8">View Restore Logs</a></p>
<p style="color:#6b7280;font-size:12px">{{company_name}} Backup & Restore System</p>
${HTML_WRAPPER_CLOSE}`,
    defaultBodyText: `ALERT: SAFETY BACKUP FAILED

Creation of the pre-restore safety snapshot failed for operation {{operation_id}}.
The restore was aborted without touching production data.
Error: {{error}}

View logs: {{view_url}}
{{company_name}} Backup & Restore System`,
    sampleContext: COMMON_RESTORE_SAMPLE_CONTEXT,
  },
];

export function getEventDefinition(
  eventType: string,
): EmailEventDefinition | undefined {
  return EMAIL_EVENT_DEFINITIONS.find(
    (definition) => definition.eventType === eventType,
  );
}

export function allowedVariableNames(eventType: string): string[] {
  const definition = getEventDefinition(eventType);
  if (!definition) return [];
  return definition.variables.map((variable) => variable.name);
}

export function urlVariableNames(eventType: string): string[] {
  const definition = getEventDefinition(eventType);
  if (!definition) return [];
  return definition.variables
    .filter((variable) => variable.kind === 'url')
    .map((variable) => variable.name);
}
