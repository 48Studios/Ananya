import { describe, it, expect } from "vitest";
import {
  deriveImportJobState,
  isJobTerminal,
  ImportJobStateInput,
} from "./import-job-status";

describe("Import Job Status & State Semantics", () => {
  it("correctly identifies FAILED status even when progressPercent === 100", () => {
    const job: ImportJobStateInput = {
      status: "FAILED",
      totalRecords: 24,
      processedRecords: 0,
      failedRecords: 24,
    };

    const derived = deriveImportJobState(job);
    expect(derived).toBe("FAILED");
    expect(derived).not.toBe("COMPLETED_SUCCESS");
  });

  it("correctly identifies COMPLETED_SUCCESS status when all records succeed", () => {
    const job: ImportJobStateInput = {
      status: "COMPLETED",
      totalRecords: 24,
      processedRecords: 24,
      failedRecords: 0,
    };

    const derived = deriveImportJobState(job);
    expect(derived).toBe("COMPLETED_SUCCESS");
  });

  it("correctly identifies COMPLETED_PARTIAL status when some records succeed and some fail", () => {
    const job: ImportJobStateInput = {
      status: "COMPLETED",
      totalRecords: 24,
      processedRecords: 20,
      failedRecords: 4,
    };

    const derived = deriveImportJobState(job);
    expect(derived).toBe("COMPLETED_PARTIAL");
  });

  it("identifies PROCESSING status while job is running regardless of progressPercent", () => {
    const job: ImportJobStateInput = {
      status: "PROCESSING",
      totalRecords: 24,
      processedRecords: 0,
      failedRecords: 0,
    };

    const derived = deriveImportJobState(job);
    expect(derived).toBe("PROCESSING");
  });

  it("correctly evaluates isJobTerminal", () => {
    expect(isJobTerminal("COMPLETED")).toBe(true);
    expect(isJobTerminal("FAILED")).toBe(true);
    expect(isJobTerminal("PROCESSING")).toBe(false);
    expect(isJobTerminal("QUEUED")).toBe(false);
    expect(isJobTerminal(null)).toBe(false);
  });
});
