/** AI Medical Document Scanner — mirror of backend ExtractedLabValue / LabExtractionResponse. */

/** A value copied exactly as written in the document (never interpreted as a diagnosis). */
export interface LabValueEntry {
  name: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  sourceLine?: string | null;
  /** Analysis date (yyyy-mm-dd) as written in the document, confirmed by the user. */
  measuredAt?: string | null;
  /** Extraction only: OCR / incomplete line → the user must confirm it before saving. */
  needsReview?: boolean;
}

export interface LabExtractionResponse {
  /** false → no readable text (scanned / photo without OCR). */
  textFound: boolean;
  pageCount: number;
  /** How the text was read: PDF text layer, local OCR, or nothing. */
  method: 'text' | 'ocr' | 'none';
  /** false → the server has no OCR engine installed (images / scanned PDFs can't be read). */
  ocrAvailable: boolean;
  /** Analysis date found in the document (only when unambiguous), yyyy-mm-dd. */
  documentDate: string | null;
  values: LabValueEntry[];
}

/** A confirmed value with its source document (Medical Timeline / trends). */
export interface PatientLabValue extends LabValueEntry {
  documentId: string;
  documentTitle: string | null;
  /** Upload date (yyyy-mm-dd) — used when the analysis date is unknown. */
  documentDate: string | null;
}
