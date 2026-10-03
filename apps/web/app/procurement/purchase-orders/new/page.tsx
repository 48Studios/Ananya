import PurchaseOrdersPage from "../page";

/**
 * Dedicated purchase-order creation route.
 *
 * Reuses the purchase-orders list's create dialog (same form, validation, and
 * mutation). Successful creation hands off to the new PO's detail page.
 */
export default function NewPurchaseOrderPage() {
  return <PurchaseOrdersPage autoOpenCreate />;
}
