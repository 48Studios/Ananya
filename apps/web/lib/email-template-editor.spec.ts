import { describe, it, expect } from "vitest";
import {
  describeOutboxStatus,
  draftFromTemplate,
  extractTemplateVariables,
  findUnknownVariables,
  hasUnsavedChanges,
  outboxStatusClassName,
} from "./email-template-editor";
import type { EmailTemplateDto } from "./api/email-templates-api";

function makeTemplate(overrides: Partial<EmailTemplateDto> = {}): EmailTemplateDto {
  return {
    id: "tpl-1",
    eventType: "inventory.low_stock",
    category: "Inventory",
    name: "Low stock alert",
    subject: "Low stock: {{component_sku}}",
    bodyHtml: "<p>{{component_name}}</p>",
    bodyText: "{{component_name}}",
    isEnabled: true,
    version: 1,
    createdAt: "2026-10-03T00:00:00.000Z",
    updatedAt: "2026-10-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("email template editor helpers", () => {
  it("extracts and deduplicates variables", () => {
    expect(
      extractTemplateVariables(
        "{{component_sku}} {{ component_sku }} {{quantity_available}}",
      ),
    ).toEqual(["component_sku", "quantity_available"]);
  });

  it("flags unknown variables across every field", () => {
    const unknown = findUnknownVariables(
      {
        subject: "{{component_sku}}",
        bodyHtml: "<p>{{secret_token}}</p>",
        bodyText: "{{component_name}}",
        isEnabled: true,
      },
      ["component_sku", "component_name"],
    );

    expect(unknown).toEqual(["secret_token"]);
  });

  it("detects unsaved edits including the enabled toggle", () => {
    const template = makeTemplate();
    const draft = draftFromTemplate(template);
    expect(hasUnsavedChanges(template, draft)).toBe(false);

    expect(
      hasUnsavedChanges(template, { ...draft, subject: "Changed" }),
    ).toBe(true);
    expect(
      hasUnsavedChanges(template, { ...draft, isEnabled: false }),
    ).toBe(true);
  });

  it("labels delivery statuses without claiming inbox delivery", () => {
    expect(describeOutboxStatus("QUEUED")).toBe("Queued");
    expect(describeOutboxStatus("SENT")).toBe("Accepted by provider");
    expect(describeOutboxStatus("FAILED")).toBe("Failed");
    expect(describeOutboxStatus("SKIPPED")).toBe("Skipped (mail disabled)");
  });

  it("styles delivery statuses consistently", () => {
    expect(outboxStatusClassName("SENT")).toContain("emerald");
    expect(outboxStatusClassName("FAILED")).toContain("destructive");
    expect(outboxStatusClassName("QUEUED")).toContain("amber");
  });
});
