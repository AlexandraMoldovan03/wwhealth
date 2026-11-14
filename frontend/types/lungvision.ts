/**
 * LungVision (experimental) — response of POST /api/ai/lung/analyze.
 * `score` is the model's sigmoid output, NOT a clinical probability or diagnosis.
 */
export interface LungAnalysis {
  /** Model score in [0, 1] (DenseNet121 trained on PneumoniaMNIST). */
  score: number;
  /** Experimental threshold chosen on the validation set (0.3). */
  threshold: number;
  aboveThreshold: boolean;
  /** e.g. "Pneumonia pattern flagged (experimental)" / "Not flagged (experimental)". */
  label: string;
  /** Grad-CAM overlay as base64 PNG (no "data:" prefix). */
  heatmapPngBase64: string | null;
  modelVersion: string;
  processingTimeMs: number;
  isExperimental: boolean;
  disclaimer: string;
}
