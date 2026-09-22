import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Master-data form modals — one dialog chrome for add and edit.
 *
 * Every master-data form is mounted as `<DialogShell>{form}</DialogShell>`, so
 * the form itself owns the body and footer regions. Those regions must come from
 * the shared primitives (`DialogShellBody` / `DialogShellFooter`) rather than
 * from per-form markup: the primitives carry the standard dialog padding
 * (`px-6 py-5`) and the separator above the footer. A hand-rolled footer loses
 * that padding and draws a second border, which is exactly the inconsistency
 * reported on the Unit of Measure modal.
 *
 * These are source assertions over the real files (this workspace has no DOM
 * testing library — the same convention as the rest of the web suite).
 */

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

const DIALOG_SHELL = "components/ui/dialog-shell.tsx";
const STANDARD_FORM_SHELL = 'className="flex min-h-0 flex-1 flex-col"';
const STANDARD_BODY = '<DialogShellBody className="space-y-4">';

/** Master-data add/edit forms — every one of them is a `DialogShell` child. */
const MASTER_DATA_FORMS = [
  "components/categories/category-form.tsx",
  "components/locations/location-form.tsx",
  "components/manufacturers/manufacturer-form.tsx",
  "components/suppliers/supplier-form.tsx",
  "components/units/unit-form.tsx",
];

const dialogShellSource = read(DIALOG_SHELL);

describe("dialog shell padding primitives", () => {
  it("defines the body and footer padding in one place", () => {
    // Body: standard dialog padding, scrolls, never shrinks below its content.
    expect(dialogShellSource).toContain("min-h-0 flex-1 px-6 py-5");
    // Footer: same horizontal/vertical padding, pinned by the shell.
    expect(dialogShellSource).toContain("px-6 py-5 shrink-0");
  });

  it("renders the separator above the footer for every dialog", () => {
    const footer = dialogShellSource.slice(
      dialogShellSource.indexOf("export function DialogShellFooter"),
    );
    expect(footer).toContain('<Separator className="shrink-0" />');
  });
});

describe("Unit of Measure form dialog chrome", () => {
  const unitForm = read("components/units/unit-form.tsx");

  it("uses the shared body and footer primitives", () => {
    expect(unitForm).toContain("DialogShellBody");
    expect(unitForm).toContain("DialogShellFooter");
    expect(unitForm).toContain("DialogShellCancelButton");
    expect(unitForm).toContain('} from "@/components/ui/dialog-shell"');
  });

  it("carries the standard body padding instead of raw fields", () => {
    expect(unitForm).toContain(STANDARD_BODY);

    // Every field lives between the body tags: the body owns the content
    // padding, so no field may be a direct child of the form element.
    const bodyOpen = unitForm.indexOf("<DialogShellBody");
    const bodyClose = unitForm.indexOf("</DialogShellBody>");
    const firstField = unitForm.indexOf("<Field>");
    const lastField = unitForm.lastIndexOf("</Field>");

    expect(bodyOpen).toBeGreaterThan(-1);
    expect(firstField).toBeGreaterThan(bodyOpen);
    expect(lastField).toBeLessThan(bodyClose);
  });

  it("lets the body scroll while the footer stays pinned", () => {
    expect(unitForm).toContain(STANDARD_FORM_SHELL);
  });

  it("has no hand-rolled footer left behind", () => {
    expect(unitForm).not.toContain("justify-end gap-2 pt-2 border-t");
    expect(unitForm).not.toContain("pt-2 border-t border-border");
  });

  it("keeps Cancel before the primary action in the shared footer", () => {
    expect(unitForm).toContain("<DialogShellCancelButton");
    const footer = unitForm.slice(unitForm.indexOf("<DialogShellFooter>"));
    expect(footer.indexOf("DialogShellCancelButton")).toBeLessThan(
      footer.indexOf('type="submit"'),
    );
  });
});

describe("master-data form dialogs stay consistent", () => {
  it("shares one form shell, body and footer across every master-data form", () => {
    for (const form of MASTER_DATA_FORMS) {
      const source = read(form);
      expect(source, `${form} must use the flex column form shell`).toContain(
        STANDARD_FORM_SHELL,
      );
      expect(source, `${form} must use the shared body`).toContain(
        STANDARD_BODY,
      );
      expect(source, `${form} must use the shared footer`).toContain(
        "<DialogShellFooter>",
      );
    }
  });

  it("leaves no form with per-form footer markup", () => {
    for (const form of MASTER_DATA_FORMS) {
      const source = read(form);
      expect(source, `${form} must not hand-roll its footer`).not.toContain(
        "pt-2 border-t border-border",
      );
    }
  });
});
