/** Shape of an AI analysis result. Keep it in sync with your FastAPI response model. */

export interface AnalysisLabel {
  label: string;
  confidence: number; // 0..1
}

export interface AnalysisResult {
  id: string;
  createdAt: string; // ISO date
  summary: string;
  labels: AnalysisLabel[];
  processingTimeMs: number;
  model: string;
  /** true when the result was produced by the mock service. */
  isDemo: boolean;
}
