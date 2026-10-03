import ComponentsPage from "../page";

interface NewComponentPageProps {
  searchParams: Promise<{ sku?: string | string[] }>;
}

/**
 * Dedicated component creation route.
 *
 * Reuses the catalog's create dialog (same form, validation, and mutation) and
 * hands `?sku=` through so the scanner's "unknown barcode" deep link opens the
 * form with the code prefilled instead of a dead URL.
 */
export default async function NewComponentPage({
  searchParams,
}: NewComponentPageProps) {
  const params = await searchParams;
  const sku = typeof params.sku === "string" ? params.sku : undefined;
  return <ComponentsPage autoOpenCreate initialSku={sku} />;
}
