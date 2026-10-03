import WarehouseTransfersPage from "../page";

/**
 * Dedicated transfer creation route.
 *
 * Reuses the transfers list's create dialog (same form, validation, and
 * mutation). Successful creation hands off to the new transfer's detail page.
 */
export default function NewWarehouseTransferPage() {
  return <WarehouseTransfersPage autoOpenCreate />;
}
