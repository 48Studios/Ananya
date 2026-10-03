import GoodsReceiptsPage from "../page";

interface NewGoodsReceiptPageProps {
  searchParams: Promise<{ poId?: string | string[] }>;
}

/**
 * Dedicated goods-receipt creation route.
 *
 * Reuses the receipts list's create dialog and passes `?poId=` through to the
 * form's existing `initialPurchaseOrderId` prefill, which is the deep link the
 * dashboard's "receive against this PO" action already emits.
 */
export default async function NewGoodsReceiptPage({
  searchParams,
}: NewGoodsReceiptPageProps) {
  const params = await searchParams;
  const poId = typeof params.poId === "string" ? params.poId : undefined;
  return (
    <GoodsReceiptsPage autoOpenCreate initialPurchaseOrderId={poId} />
  );
}
