import { PurchaseInvoice } from "./purchase-invoice";
import { PurchaseOrder } from "../purchase-orders";
import { GoodsReceipt } from "../goods-receipts";

export interface MatchResult {
  isMatch: boolean;
  varianceReason?: "PRICE" | "QUANTITY";
  details: string[];
}

export class ThreeWayMatcher {
  public static evaluate(
    invoice: PurchaseInvoice,
    po: PurchaseOrder,
    goodsReceipts: GoodsReceipt[],
  ): MatchResult {
    const details: string[] = [];
    let isMatch = true;
    let varianceReason: "PRICE" | "QUANTITY" | undefined;

    for (const invLine of invoice.lines) {
      const poLine = po.lines.find(
        (l) => l.componentId === invLine.componentId,
      );

      if (!poLine) {
        isMatch = false;
        varianceReason = "PRICE";
        details.push(
          `Component ${invLine.componentId} billed on invoice does not exist on PO.`,
        );
        continue;
      }

      // Check unit price match
      if (Math.abs(invLine.unitPrice - poLine.unitPrice) > 0.0001) {
        isMatch = false;
        varianceReason = "PRICE";
        details.push(
          `Price variance for component ${invLine.componentId}: PO price $${poLine.unitPrice}, Invoice price $${invLine.unitPrice}.`,
        );
      }

      // Calculate total received across goods receipts
      const totalReceived = goodsReceipts.reduce((sum, gr) => {
        const grLines = gr.lines.filter(
          (l) => l.componentId === invLine.componentId,
        );
        return sum + grLines.reduce((s, l) => s + l.quantityReceived, 0);
      }, 0);

      if (invLine.quantityBilled > totalReceived) {
        isMatch = false;
        if (!varianceReason) varianceReason = "QUANTITY";
        details.push(
          `Quantity variance for component ${invLine.componentId}: Billed ${invLine.quantityBilled}, Received ${totalReceived}.`,
        );
      }
    }

    return {
      isMatch,
      varianceReason,
      details,
    };
  }
}
