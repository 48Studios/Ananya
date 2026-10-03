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
