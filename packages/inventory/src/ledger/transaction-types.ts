export const TRANSACTION_TYPES = [
  "Receipt",
  "Issue",
  "Transfer",
  "Adjustment",
  "Return",
  "Consumption",
  "Production",
  "ManualCorrection",
  "InitialStock",
] as const;

export const TransactionType = {
  Receipt: TRANSACTION_TYPES[0],
  Issue: TRANSACTION_TYPES[1],
  Transfer: TRANSACTION_TYPES[2],
  Adjustment: TRANSACTION_TYPES[3],
  Return: TRANSACTION_TYPES[4],
  Consumption: TRANSACTION_TYPES[5],
  Production: TRANSACTION_TYPES[6],
  ManualCorrection: TRANSACTION_TYPES[7],
  InitialStock: TRANSACTION_TYPES[8],
} as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
