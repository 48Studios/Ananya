import { describe, it, expect } from "vitest";
import { Account } from "./accounts/account";
import { JournalEntry } from "./journals/journal-entry";
import { ReceivableInvoice } from "./receivables/receivable-invoice";
import { PayableInvoice } from "./payables/payable-invoice";
import { Payment } from "./payments/payment";
import { BankReconciliation } from "./banking/bank-reconciliation";

describe("Financial Core Bounded Context Aggregates", () => {
  describe("Account Aggregate", () => {
    it("should create an active Account with valid type", () => {
      const account = Account.create({
        accountNumber: "1000",
        name: "Cash and Cash Equivalents",
        accountType: "ASSET",
      });
      expect(account.accountNumber).toBe("1000");
      expect(account.accountType).toBe("ASSET");
      expect(account.isActive).toBe(true);

      account.deactivate();
      expect(account.isActive).toBe(false);
    });
  });

  describe("JournalEntry Aggregate", () => {
    it("should enforce double-entry debit/credit balance invariant on posting", () => {
      const journal = JournalEntry.create({
        journalNumber: "JE-2026-0001",
        description: "Customer Payment Entry",
      });

      journal.addLine({ accountId: "acc-1", debit: 100, credit: 0 });
      journal.addLine({ accountId: "acc-2", debit: 0, credit: 100 });

      expect(journal.status).toBe("DRAFT");
      journal.post();
      expect(journal.status).toBe("POSTED");
    });

    it("should throw error when posting unbalanced journal entry", () => {
      const journal = JournalEntry.create({
        journalNumber: "JE-2026-0002",
        description: "Unbalanced Entry",
      });

      journal.addLine({ accountId: "acc-1", debit: 100, credit: 0 });
      journal.addLine({ accountId: "acc-2", debit: 0, credit: 50 });

      expect(() => journal.post()).toThrow();
    });
  });

  describe("ReceivableInvoice Aggregate", () => {
    it("should handle lifecycle from post to payment application", () => {
      const inv = ReceivableInvoice.create({
        invoiceNumber: "INV-2026-0001",
        customerId: "cust-1",
        salesOrderId: "so-1",
        dueDate: new Date(),
        amount: 500,
      });

      expect(inv.status).toBe("DRAFT");
      inv.post();
      expect(inv.status).toBe("POSTED");

      inv.applyPayment(200);
      expect(inv.balance).toBe(300);
      expect(inv.status).toBe("PARTIALLY_PAID");

      inv.applyPayment(300);
      expect(inv.balance).toBe(0);
      expect(inv.status).toBe("PAID");
    });
  });

  describe("PayableInvoice Aggregate", () => {
    it("should track vendor bill liabilities", () => {
      const bill = PayableInvoice.create({
        invoiceNumber: "BILL-2026-0001",
        supplierId: "supp-1",
        purchaseInvoiceId: "pi-1",
        dueDate: new Date(),
        amount: 1200,
      });

      bill.post();
      bill.applyPayment(1200);
      expect(bill.status).toBe("PAID");
      expect(bill.balance).toBe(0);
    });
  });

  describe("Payment Aggregate", () => {
    it("should support customer payments and status transitions", () => {
      const payment = Payment.create({
        paymentNumber: "PAY-2026-0001",
        paymentType: "CUSTOMER_PAYMENT",
        paymentMethod: "WIRE_TRANSFER",
        amount: 500,
      });

      expect(payment.status).toBe("DRAFT");
      payment.post();
      expect(payment.status).toBe("POSTED");
      payment.markReconciled();
      expect(payment.status).toBe("RECONCILED");
    });
  });

  describe("BankReconciliation Aggregate", () => {
    it("should match bank statement transactions and complete reconciliation", () => {
      const recon = BankReconciliation.create({
        bankAccountId: "bank-1",
        statementDate: new Date(),
        openingBalance: 1000,
        closingBalance: 1500,
      });

      const tx = recon.addTransaction({
        transactionDate: new Date(),
        description: "Customer Wire Inflow",
        amount: 500,
      });

      expect(tx.isMatched).toBe(false);
      recon.matchTransaction(tx.id, "pay-1");
      expect(recon.transactions[0]!.isMatched).toBe(true);

      recon.complete();
      expect(recon.status).toBe("COMPLETED");
    });
  });
});
