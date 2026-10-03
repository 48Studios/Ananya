import WorkOrdersPage from "../page";

/**
 * Dedicated work-order creation route.
 *
 * Reuses the work-orders list's create dialog (same form, validation, and
 * mutation). Successful creation hands off to the new work order's detail page.
 */
export default function NewWorkOrderPage() {
  return <WorkOrdersPage autoOpenCreate />;
}
