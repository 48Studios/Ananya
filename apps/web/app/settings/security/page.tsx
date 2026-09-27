import { redirect } from "next/navigation";

export default function SecurityAuditRedirect() {
  redirect("/audit");
}
