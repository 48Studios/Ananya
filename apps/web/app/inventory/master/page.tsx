import { redirect } from "next/navigation";

/** Master Data namespace root; the default child is Categories. */
export default function InventoryMasterPage() {
  redirect("/inventory/master/categories");
}
