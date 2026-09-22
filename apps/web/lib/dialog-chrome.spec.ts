import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Dialog chrome — one content and footer padding for every modal.
 *
 * `DialogShell` owns the dialog frame; the content and footer regions belong to
 * the shared `DialogShellBody` / `DialogShellFooter` primitives, which carry the
 * standard padding (`px-6 py-5`) and the separator above the footer. Two
 * deviations were found across the app and are pinned here:
 *
 *  1. a form rendered its fields directly inside the `<form>` with a
 *     hand-rolled `pt-2 border-t` footer — no padding at all;
 *  2. a page wrapped a form in an inlined copy of the body
 *     (`min-h-0 flex-1 overflow-y-auto px-6 py-5`) while the form ALSO rendered
 *     its own body — content then sat at 48px instead of the standard 24px.
 *
 * These are source assertions over the real files (this workspace has no DOM
 * testing library — the same convention as the rest of the web suite). The
 * runtime geometry behind them was verified in the browser: header, body and
 * footer all measure `20px 24px 20px 24px` and content starts 24px inside the
 * dialog.
 */

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(webRoot, dir), {
    withFileTypes: true,
  })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(relative, acc);
    else if (entry.name.endsWith(".tsx")) acc.push(relative);
  }
  return acc;
}

const appFiles = walk("app");
const componentFiles = walk("components");
const allFiles = [...appFiles, ...componentFiles];

const DIALOG_SHELL = "components/ui/dialog-shell.tsx";
const STANDARD_FORM_SHELL = "flex min-h-0 flex-1 flex-col";
const STANDARD_BODY = '<DialogShellBody className="space-y-4">';

/**
 * The body classes, inlined by hand. This is the signature of deviation 2: the
 * string is a byte-copy of `DialogShellBody`'s own className.
 */
const INLINED_BODY_CLASSES = [
  "min-h-0 flex-1 overflow-y-auto px-6 py-5",
  "min-h-0 flex-1 px-6 py-5 overflow-y-auto",
];

/** Footer markup a form hand-rolls when it skips `DialogShellFooter`. */
const HAND_ROLLED_FOOTER = "justify-end gap-2 pt-2 border-t";

/** Master-data add/edit forms — every one of them is a `DialogShell` child. */
const MASTER_DATA_FORMS = [
  "components/categories/category-form.tsx",
  "components/locations/location-form.tsx",
  "components/manufacturers/manufacturer-form.tsx",
  "components/suppliers/supplier-form.tsx",
  "components/units/unit-form.tsx",
];

/**
 * Every form mounted as `<DialogShell>{form}</DialogShell>`, including the ones
 * that previously deviated. Each must own its body and footer through the
 * primitives.
 */
const SHELL_MOUNTED_FORMS = [
  ...MASTER_DATA_FORMS,
  "components/attributes/attribute-form-dialog.tsx",
  "components/boms/bom-form.tsx",
  "components/components/component-form.tsx",
  "components/cycle-counts/cycle-count-form.tsx",
  "components/finished-goods/finished-goods-form.tsx",
  "components/goods-receipts/gr-form.tsx",
  "components/maintenance/maintenance-form.tsx",
  "components/material-consumption/material-consumption-form.tsx",
  "components/projects/project-form.tsx",
  "components/purchase-orders/po-form.tsx",
  "components/reservations/reservation-form.tsx",
  "components/rma/rma-request-form.tsx",
  "components/service/service-request-form.tsx",
  "components/stock-adjustments/adjustment-form.tsx",
  "components/supplier-returns/supplier-return-form.tsx",
  "components/tasks/task-form.tsx",
  "components/time/time-entry-form.tsx",
  "components/warehouse/warehouse-policy-form.tsx",
  "components/warehouse-transfers/warehouse-transfer-form.tsx",
  "components/warranty/warranty-claim-form.tsx",
  "components/work-orders/work-order-form.tsx",
];

const dialogShellSource = read(DIALOG_SHELL);

describe("dialog shell padding primitives", () => {
  it("defines the body padding in exactly one place", () => {
    // Body: standard dialog padding, scrolls, never shrinks below its content.
    expect(dialogShellSource).toContain("min-h-0 flex-1 px-6 py-5");
    expect(dialogShellSource).toContain(
      'scrollable ? "overflow-y-auto" : "flex flex-col gap-4 overflow-hidden"',
    );
  });

  it("defines the footer padding in exactly one place", () => {
    expect(dialogShellSource).toContain("px-6 py-5 shrink-0");
  });

  it("renders the separator above the footer for every dialog", () => {
    const footer = dialogShellSource.slice(
      dialogShellSource.indexOf("export function DialogShellFooter"),
    );
    expect(footer).toContain('<Separator className="shrink-0" />');
  });
});

describe("no dialog inlines its own body or footer", () => {
  it("never inlines the body padding classes", () => {
    for (const file of allFiles) {
      if (file === DIALOG_SHELL) continue;
      const source = read(file);
      for (const inlined of INLINED_BODY_CLASSES) {
        expect(
          source,
          `${file} must use DialogShellBody instead of inlining its classes`,
        ).not.toContain(inlined);
      }
    }
  });

  it("never hand-rolls a footer with its own top border", () => {
    for (const file of allFiles) {
      const source = read(file);
      expect(
        source,
        `${file} must use DialogShellFooter instead of a bordered action row`,
      ).not.toContain(HAND_ROLLED_FOOTER);
    }
  });

  it("never re-declares the shell padding on the dialog content", () => {
    // DialogShell already sets `p-0`, so `contentClassName="p-0"` is a no-op
    // (tailwind-merge keeps one). Anything that would actually inset the header
    // and footer — `p-4`, `px-6`, `py-5`, ... — is the defect.
    for (const file of allFiles) {
      const source = read(file);
      for (const match of source.matchAll(/contentClassName="([^"]*)"/g)) {
        const value = match[1] ?? "";
        const padding =
          value.match(/(^|\s)(p|px|py|pt|pb|pl|pr)-([^\s]+)/g) ?? [];
        const insets = padding.filter((token) => !token.trim().endsWith("-0"));
        expect(
          insets,
          `${file} must not pad the dialog content (${value})`,
        ).toEqual([]);
      }
    }
  });
});

describe("form dialogs share one chrome", () => {
  it("gives every shell-mounted form a scrollable body and a pinned footer", () => {
    for (const form of SHELL_MOUNTED_FORMS) {
      const source = read(form);
      // The shell class may carry extra utilities (e.g. `overflow-hidden` on
      // forms whose body owns the scroll), but the flex column base is fixed.
      expect(source, `${form} must use the flex column form shell`).toContain(
        STANDARD_FORM_SHELL,
      );
      expect(source, `${form} must use the shared body`).toContain(
        "<DialogShellBody",
      );
      expect(source, `${form} must use the shared footer`).toContain(
        "<DialogShellFooter>",
      );
    }
  });

  it("keeps every field inside the body, never as a raw form child", () => {
    for (const form of SHELL_MOUNTED_FORMS) {
      const source = read(form);
      const bodyOpen = source.indexOf("<DialogShellBody");
      const bodyClose = source.indexOf("</DialogShellBody>");
      const firstField = source.indexOf("<Field");
      const lastField = source.lastIndexOf("</Field>");

      expect(bodyOpen, `${form} body missing`).toBeGreaterThan(-1);
      expect(bodyClose, `${form} body not closed`).toBeGreaterThan(bodyOpen);
      if (firstField !== -1) {
        expect(
          firstField,
          `${form} renders a field before the body opens`,
        ).toBeGreaterThan(bodyOpen);
        expect(
          lastField,
          `${form} renders a field after the body closes`,
        ).toBeLessThan(bodyClose);
      }
    }
  });

  it("orders Cancel before the primary action in every shared footer", () => {
    for (const form of SHELL_MOUNTED_FORMS) {
      const source = read(form);
      const footer = source.slice(source.indexOf("<DialogShellFooter>"));
      const cancel = footer.indexOf("DialogShellCancelButton");
      const submit = footer.indexOf('type="submit"');
      expect(cancel, `${form} footer missing Cancel`).toBeGreaterThan(-1);
      expect(submit, `${form} footer missing submit`).toBeGreaterThan(-1);
      expect(cancel, `${form} must render Cancel first`).toBeLessThan(submit);
    }
  });
});

describe("Unit of Measure form dialog chrome", () => {
  const unitForm = read("components/units/unit-form.tsx");

  it("uses the shared body, footer and cancel primitives", () => {
    expect(unitForm).toContain("DialogShellBody");
    expect(unitForm).toContain("DialogShellFooter");
    expect(unitForm).toContain("DialogShellCancelButton");
    expect(unitForm).toContain('} from "@/components/ui/dialog-shell"');
    expect(unitForm).toContain(STANDARD_BODY);
  });
});
