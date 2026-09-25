"use client";

import { ScannedEntityModal } from "@/components/barcodes/scanned-entity-modal";
import { BarcodeLookupResult } from "@/lib/api/barcodes-api";

/**
 * The scanner's details overlay.
 *
 * This is the ERP's own component-details modal — the one the in-app scan
 * dialog opens — with navigation switched off: the same record, the same stock,
 * storage-location and description fields, the same label printing. There is
 * deliberately no second implementation of "what a scanned component looks
 * like", so the scanner and the ERP can never disagree about it.
 *
 * The scanner supplies the record and is told when the modal closes. Because the
 * modal is an overlay, the camera stays behind it and scanning resumes the
 * moment it closes.
 */
export interface ScannerDetailsModalProps {
  open: boolean;
  result: BarcodeLookupResult | null;
  onClose: () => void;
}

export function ScannerDetailsModal({
  open,
  result,
  onClose,
}: ScannerDetailsModalProps) {
  if (!result) return null;

  return (
    <ScannedEntityModal
      isOpen={open}
      onClose={onClose}
      onScanAnother={onClose}
      result={result}
      allowNavigation={false}
    />
  );
}
