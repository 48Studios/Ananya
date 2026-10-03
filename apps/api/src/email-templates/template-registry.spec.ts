import {
  EMAIL_EVENT_DEFINITIONS,
  INVENTORY_EVENT_TYPES,
  allowedVariableNames,
  getEventDefinition,
  urlVariableNames,
} from './template-registry';
import {
  extractTemplateVariables,
  validateTemplateContent,
} from './template-renderer';

describe('email event registry', () => {
  it('covers every supported inventory alert type', () => {
    const eventTypes = EMAIL_EVENT_DEFINITIONS.map(
      (definition) => definition.eventType,
    );

    expect(eventTypes).toEqual(
      expect.arrayContaining([
        INVENTORY_EVENT_TYPES.LOW_STOCK,
        INVENTORY_EVENT_TYPES.OUT_OF_STOCK,
        INVENTORY_EVENT_TYPES.STOCK_RECOVERED,
      ]),
    );
  });

  it.each(EMAIL_EVENT_DEFINITIONS.map((definition) => [definition.eventType]))(
    'provides a complete, valid default template for %s',
    (eventType) => {
      const definition = getEventDefinition(eventType);
      expect(definition).toBeDefined();

      const result = validateTemplateContent(
        {
          subject: definition!.defaultSubject,
          bodyHtml: definition!.defaultBodyHtml,
          bodyText: definition!.defaultBodyText,
        },
        allowedVariableNames(eventType),
      );

      expect(result.valid).toBe(true);
      expect(result.unknownVariables).toEqual([]);
    },
  );

  it.each(EMAIL_EVENT_DEFINITIONS.map((definition) => [definition.eventType]))(
    'sample context supplies every variable used by the %s default template',
    (eventType) => {
      const definition = getEventDefinition(eventType)!;
      const used = new Set([
        ...extractTemplateVariables(definition.defaultSubject),
        ...extractTemplateVariables(definition.defaultBodyHtml),
        ...extractTemplateVariables(definition.defaultBodyText),
      ]);

      for (const variable of used) {
        expect(definition.sampleContext[variable]).toBeDefined();
      }
    },
  );

  it('documents every allowlisted variable with a description and example', () => {
    for (const definition of EMAIL_EVENT_DEFINITIONS) {
      expect(definition.variables.length).toBeGreaterThan(0);
      for (const variable of definition.variables) {
        expect(variable.description.length).toBeGreaterThan(0);
        expect(variable.example.length).toBeGreaterThan(0);
      }
    }
  });

  it('marks navigation variables as URLs so they are sanitized', () => {
    expect(urlVariableNames(INVENTORY_EVENT_TYPES.LOW_STOCK)).toEqual(
      expect.arrayContaining(['alert_url', 'alerts_url']),
    );
  });

  it('does not expose a shortage variable on the recovery event', () => {
    expect(
      allowedVariableNames(INVENTORY_EVENT_TYPES.STOCK_RECOVERED),
    ).not.toContain('shortage_quantity');
  });
});
