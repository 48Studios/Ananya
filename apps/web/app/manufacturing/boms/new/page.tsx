import BomsPage from "../page";

/**
 * Dedicated BOM creation route.
 *
 * Reuses the BOM list's create dialog (same form, validation, and mutation).
 * Successful creation hands off to the new revision's detail page.
 */
export default function NewBomPage() {
  return <BomsPage autoOpenCreate />;
}
