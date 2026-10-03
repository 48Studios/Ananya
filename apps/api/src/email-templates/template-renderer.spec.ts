import {
  extractTemplateVariables,
  renderEmailContent,
  renderTemplate,
  sanitizeInternalUrl,
  sanitizeSubject,
  validateTemplateContent,
} from './template-renderer';

const ALLOWED = [
  'component_name',
  'component_sku',
  'quantity_available',
  'alert_url',
  'occurred_at',
];

describe('extractTemplateVariables', () => {
  it('finds variables regardless of inner whitespace and deduplicates', () => {
    expect(
      extractTemplateVariables(
        '{{component_sku}} {{ component_sku }} {{quantity_available}}',
      ),
    ).toEqual(['component_sku', 'quantity_available']);
  });

  it('ignores malformed braces and expressions', () => {
    expect(
      extractTemplateVariables('{{ component-name }} {not-a-var}'),
    ).toEqual([]);
  });
});

describe('validateTemplateContent', () => {
  const validContent = {
    subject: 'Low stock: {{component_sku}}',
    bodyHtml: '<p>{{component_name}} is low.</p>',
    bodyText: '{{component_name}} is low.',
  };

  it('accepts allowlisted variables', () => {
    const result = validateTemplateContent(validContent, ALLOWED);

    expect(result.valid).toBe(true);
    expect(result.unknownVariables).toEqual([]);
  });

  it('rejects unknown variables with an actionable message', () => {
    const result = validateTemplateContent(
      { ...validContent, subject: 'Hello {{customer_secret}}' },
      ALLOWED,
    );

    expect(result.valid).toBe(false);
    expect(result.unknownVariables).toEqual(['customer_secret']);
    expect(result.errors.join(' ')).toContain('{{customer_secret}}');
  });

  it('rejects empty fields', () => {
    const result = validateTemplateContent(
      { subject: '  ', bodyHtml: '', bodyText: '' },
      ALLOWED,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Subject is required.',
        'HTML body is required.',
        'Plain-text body is required.',
      ]),
    );
  });

  it('rejects oversized content', () => {
    const result = validateTemplateContent(
      {
        subject: 'x'.repeat(256),
        bodyHtml: 'x'.repeat(20001),
        bodyText: 'x'.repeat(20001),
      },
      ALLOWED,
    );

    expect(result.valid).toBe(false);
    expect(
      result.errors.filter((error) => error.includes('at most')),
    ).toHaveLength(3);
  });
});

describe('renderTemplate', () => {
  it('interpolates known values and blanks unknown variables', () => {
    const rendered = renderTemplate(
      'SKU {{component_sku}} / {{not_in_context}} / end',
      { component_sku: 'MCU-01' },
      { escapeHtml: false },
    );

    expect(rendered).toBe('SKU MCU-01 /  / end');
    expect(rendered).not.toContain('{{');
  });

  it('escapes HTML context values to prevent markup injection', () => {
    const rendered = renderTemplate(
      '<p>{{component_name}}</p>',
      { component_name: '<script>alert(1)</script> & "quoted"' },
      { escapeHtml: true },
    );

    expect(rendered).not.toContain('<script>');
    expect(rendered).toContain('&lt;script&gt;');
    expect(rendered).toContain('&amp;');
    expect(rendered).toContain('&quot;');
  });

  it('does not escape plain-text context values', () => {
    const rendered = renderTemplate(
      'Name: {{component_name}}',
      { component_name: 'A & B <C>' },
      { escapeHtml: false },
    );

    expect(rendered).toBe('Name: A & B <C>');
  });

  it('sanitizes URL variables that try to leave the application', () => {
    const template = '{{alert_url}}';
    const options = { escapeHtml: false, urlVariables: ['alert_url'] };

    expect(
      renderTemplate(template, { alert_url: 'https://evil.example' }, options),
    ).toBe('');
    expect(
      renderTemplate(template, { alert_url: '//evil.example' }, options),
    ).toBe('');
    expect(
      renderTemplate(template, { alert_url: '/\\evil.example' }, options),
    ).toBe('');
    expect(
      renderTemplate(template, { alert_url: 'javascript:alert(1)' }, options),
    ).toBe('');
    expect(
      renderTemplate(
        template,
        { alert_url: '/inventory/components/abc-123' },
        options,
      ),
    ).toBe('/inventory/components/abc-123');
  });
});

describe('sanitizeInternalUrl', () => {
  it('accepts only relative internal paths', () => {
    expect(sanitizeInternalUrl('/inventory/alerts')).toBe('/inventory/alerts');
    expect(sanitizeInternalUrl('  /inventory/alerts  ')).toBe(
      '/inventory/alerts',
    );
    expect(sanitizeInternalUrl('http://localhost:3000/x')).toBe('');
    expect(sanitizeInternalUrl('/ok\u0000bad')).toBe('');
    expect(sanitizeInternalUrl('x'.repeat(501))).toBe('');
    expect(sanitizeInternalUrl(null)).toBe('');
  });
});

describe('sanitizeSubject', () => {
  it('strips CR/LF header-injection vectors', () => {
    expect(sanitizeSubject('Low stock\r\nBcc: victim@example.com')).toBe(
      'Low stock Bcc: victim@example.com',
    );
  });
});

describe('renderEmailContent', () => {
  it('renders subject, HTML and text from one context', () => {
    const rendered = renderEmailContent(
      {
        subject: 'Low stock: {{component_sku}}',
        bodyHtml: '<p>{{component_name}}</p>',
        bodyText: '{{component_name}} ({{quantity_available}})',
      },
      {
        component_sku: 'MCU-01',
        component_name: '<ESP32>',
        quantity_available: '2',
      },
      [],
    );

    expect(rendered.subject).toBe('Low stock: MCU-01');
    expect(rendered.html).toBe('<p>&lt;ESP32&gt;</p>');
    expect(rendered.text).toBe('<ESP32> (2)');
  });

  it('renders no literal undefined or null for missing optional values', () => {
    const rendered = renderEmailContent(
      {
        subject: 's',
        bodyHtml: '<p>{{component_name}}</p>',
        bodyText: '{{component_name}}',
      },
      { component_name: null },
      [],
    );

    expect(rendered.html).not.toContain('undefined');
    expect(rendered.html).not.toContain('null');
    expect(rendered.html).toBe('<p></p>');
  });
});
