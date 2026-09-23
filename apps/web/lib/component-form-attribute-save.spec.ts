import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * A specification entered by hand reaches the API.
 *
 * The Add/Edit form renders a row for every attribute bound to the selected
 * category — including attributes this component does not record yet — while
 * the Save payload carries only the entries that name their attribute
 * definition, so a provisional value can never be persisted. The manual editor
 * used to write the value alone: selecting a value in a row the component did
 * not already have produced `attributes: {}` in the request, dropping the
 * reviewer's input between the form and the API.
 *
 * These tests pin the property that fixes it — every hand edit records the
 * definition it belongs to — and the payload guard that has to survive the fix.
 */

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);
const read = (relative: string) =>
  fs.readFileSync(path.join(webRoot, relative), "utf8");

const form = read("components/components/component-form.tsx");

/** One handler's body, from its declaration to the next `\n  };`. */
function handlerBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = `);
  expect(start, `${name} is declared`).toBeGreaterThan(-1);
  const end = source.indexOf("\n  };", start);
  return source.slice(start, end === -1 ? undefined : end);
}

describe("a hand-entered attribute names its definition", () => {
  it("records the definition when a field is written", () => {
    const body = handlerBody(form, "handleAttrChange");

    expect(body).toContain("attributeDefinitionId: string");
    expect(body).toContain("attributeDefinitionId,");
    // Merged into the row rather than replacing it: the sibling fields the
    // reviewer already set (unit, option code) have to survive.
    expect(body).toContain("...prev[code],");
  });

  it("records it for a multi-select toggle too", () => {
    const body = handlerBody(form, "toggleMultiSelectOption");

    expect(body).toContain("attributeDefinitionId: string");
    expect(body).toContain("attributeDefinitionId,");
    expect(body).toContain("selectedOptionCodes: nextList,");
  });

  it("makes the definition a required argument, not an optional one", () => {
    // An optional parameter is how a future call site silently reintroduces the
    // drop: the value would compile and then be filtered out at Save.
    for (const name of ["handleAttrChange", "toggleMultiSelectOption"]) {
      const body = handlerBody(form, name);
      expect(body).toContain("attributeDefinitionId: string");
      expect(body).not.toContain("attributeDefinitionId?:");
      expect(body).not.toContain("attributeDefinitionId =");
    }
  });

  it("passes the definition from every control the editor renders", () => {
    // One per data type: SELECT, MULTI_SELECT, BOOLEAN, QUANTITY value, QUANTITY
    // unit, NUMBER/INTEGER, DATE and TEXT.
    expect(form).toContain('handleAttrChange(code, "optionCode", val, def.id)');
    expect(form).toContain("toggleMultiSelectOption(code, opt.code, def.id)");
    expect(form).toContain('handleAttrChange(code, "value", checked, def.id)');
    expect(form).toContain('handleAttrChange(code, "unit", val, def.id)');

    const valueWrites =
      form.match(
        /handleAttrChange\(\s*code,\s*"value",\s*e\.target\.value,\s*def\.id,\s*\)/g,
      ) ?? [];
    expect(valueWrites).toHaveLength(4);
  });

  it("leaves no call site that omits it", () => {
    // The shorter shapes are the ones that produced the bug; whitespace is
    // allowed so a multi-line call cannot hide from this check.
    expect(form).not.toMatch(
      /handleAttrChange\(\s*code,\s*"[a-z_]+",\s*[^,)]+\s*\)/,
    );
    expect(form).not.toMatch(/toggleMultiSelectOption\(\s*code,\s*[^,)]+\s*\)/);
  });

  it("keeps the definition the other writers already recorded", () => {
    // Loading a saved component and accepting a suggestion both name the
    // definition; the manual editor was the only writer that did not.
    expect(form).toContain("attributeDefinitionId: item.definitionId");
    expect(form).toContain("attributeValuePatch(suggestion)");
  });
});

describe("the Save payload still refuses a value with no definition", () => {
  it("filters the update payload and the create payload", () => {
    const guards =
      form.match(/Boolean\(attribute\.attributeDefinitionId\)/g) ?? [];
    expect(guards).toHaveLength(2);
  });

  it("sends the row as the editor wrote it, definition included", () => {
    expect(form).toContain("attributes: Object.fromEntries(");
    expect(form).toContain("Object.entries(attrValues).filter(");
    // Nothing rewrites the entry on the way out, so the definition the writer
    // recorded is the one the API resolves the attribute with.
    expect(form).not.toContain("delete attribute.attributeDefinitionId");
  });
});
