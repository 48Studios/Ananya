import { redirect } from "next/navigation";

/** Master Data namespace root; the only child is Suppliers. */
export default function ProcurementMasterPage() {
  redirect("/procurement/master/suppliers");
}
