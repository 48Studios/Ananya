import {
  GoodsReceipt,
  type CreateGoodsReceiptInput,
  type AddGoodsReceiptLineInput,
} from "./goods-receipt";
import type { GoodsReceiptRepository } from "./goods-receipt.repository";

export interface CreateGoodsReceiptWithLinesInput extends CreateGoodsReceiptInput {
  lines?: AddGoodsReceiptLineInput[];
}

export class CreateGoodsReceipt {
  constructor(private readonly grRepository: GoodsReceiptRepository) {}

  async execute(
    input: CreateGoodsReceiptWithLinesInput,
  ): Promise<GoodsReceipt> {
    const grNumber = input.grNumber
      ? input.grNumber
      : await this.grRepository.generateNextGrNumber();

    const gr = GoodsReceipt.create({
      grNumber,
      purchaseOrderId: input.purchaseOrderId,
      supplierId: input.supplierId,
      packingSlipNumber: input.packingSlipNumber,
      receivedAt: input.receivedAt,
    });

    if (input.lines && input.lines.length > 0) {
      for (const line of input.lines) {
        gr.addLine(line);
      }
    }

    await this.grRepository.save(gr);

    return gr;
  }
}
