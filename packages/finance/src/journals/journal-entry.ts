import { ObjectId } from "@ananya/core";

export type JournalStatus = "DRAFT" | "POSTED" | "REVERSED" | "VOID";

export interface JournalEntryLineProps {
  id: string;
  journalEntryId: string;
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalEntryProps {
  id: string;
  journalNumber: string;
  date: Date;
  description: string;
  reference?: string;
  status: JournalStatus;
  lines: JournalEntryLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateJournalEntryProps {
  journalNumber: string;
  date?: Date;
  description: string;
  reference?: string;
}

export interface AddJournalLineProps {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

export class JournalEntry implements JournalEntryProps {
  public readonly id: string;
  public journalNumber: string;
  public date: Date;
  public description: string;
  public reference?: string;
  public status: JournalStatus;
  public lines: JournalEntryLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: JournalEntryProps) {
    this.id = props.id;
    this.journalNumber = props.journalNumber;
    this.date = props.date;
    this.description = props.description;
    this.reference = props.reference;
    this.status = props.status;
    this.lines = props.lines;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateJournalEntryProps): JournalEntry {
    if (!props.journalNumber || props.journalNumber.trim() === "") {
      throw new Error("Journal number is required");
    }
    if (!props.description || props.description.trim() === "") {
      throw new Error("Journal description is required");
    }

    const now = new Date();
    return new JournalEntry({
      id: ObjectId.generate().value,
      journalNumber: props.journalNumber.trim(),
      date: props.date || now,
      description: props.description.trim(),
      reference: props.reference,
      status: "DRAFT",
      lines: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: JournalEntryProps): JournalEntry {
    return new JournalEntry(props);
  }

  public addLine(props: AddJournalLineProps): JournalEntryLineProps {
    if (this.status !== "DRAFT") {
      throw new Error("Lines can only be added to DRAFT journal entries");
    }
    if (props.debit < 0 || props.credit < 0) {
      throw new Error("Debit and Credit amounts cannot be negative");
    }
    if (props.debit === 0 && props.credit === 0) {
      throw new Error(
        "Line must have either a positive debit or credit amount",
      );
    }

    const now = new Date();
    const line: JournalEntryLineProps = {
      id: ObjectId.generate().value,
      journalEntryId: this.id,
      accountId: props.accountId,
      debit: props.debit,
      credit: props.credit,
      description: props.description,
      createdAt: now,
      updatedAt: now,
    };
    this.lines.push(line);
    this.updatedAt = now;
    return line;
  }

  public post(): void {
    if (this.status !== "DRAFT") {
      throw new Error(`Cannot post journal entry in status ${this.status}`);
    }
    if (this.lines.length < 2) {
      throw new Error("Journal entry must contain at least 2 lines to post");
    }

    const totalDebits = this.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredits = this.lines.reduce((sum, l) => sum + l.credit, 0);

    // Balance invariant: Debits == Credits
    if (Math.abs(totalDebits - totalCredits) > 0.0001) {
      throw new Error(
        `Journal entry does not balance. Debits ($${totalDebits.toFixed(2)}) != Credits ($${totalCredits.toFixed(2)})`,
      );
    }

    this.status = "POSTED";
    this.updatedAt = new Date();
  }

  public reverse(): void {
    if (this.status !== "POSTED") {
      throw new Error("Only POSTED journal entries can be reversed");
    }
    this.status = "REVERSED";
    this.updatedAt = new Date();
  }

  public void(): void {
    if (this.status !== "DRAFT") {
      throw new Error("Only DRAFT journal entries can be voided");
    }
    this.status = "VOID";
    this.updatedAt = new Date();
  }
}
