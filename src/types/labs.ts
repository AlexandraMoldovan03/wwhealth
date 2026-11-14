/** AI Medical Document Scanner — mirror of backend ExtractedLabValue / LabExtractionResponse. */

/** A value copied exactly as written in the document (never interpreted or flagged). */
export interface LabValueEntry {
  name: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  sourceLine?: string | null;
}

export interface LabExtractionResponse {
  /** false → the PDF has no text layer (scanned) — OCR is not available. */
  textFound: boolean;
  pageCount: number;
  values: LabValueEntry[];
}
