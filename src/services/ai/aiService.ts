/**
 * AI SERVICE — the only place the UI talks to for AI features.
 *
 * Today it returns simulated results (USE_MOCK_API=true).
 * To go live: set EXPO_PUBLIC_USE_MOCK_API=false and make sure your FastAPI
 * endpoint `POST /ai/analyze-image` accepts a `file` field and returns `AnalysisResult`.
 * Screens do not need to change.
 */
import { USE_MOCK_API } from '@/constants/config';
import type { AnalysisResult } from '@/types';

import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { mockAnalyzeImage } from './mockAiService';

/** Guesses the MIME type from the file extension (fallback: JPEG). */
function guessMimeType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  return 'image/jpeg';
}

export async function analyzeImage(imageUri: string): Promise<AnalysisResult> {
  if (USE_MOCK_API) return mockAnalyzeImage(imageUri);

  const name = imageUri.split('/').pop() ?? 'image.jpg';
  const result = await apiClient.upload<AnalysisResult>(ENDPOINTS.analyzeImage, {
    file: { uri: imageUri, name, type: guessMimeType(imageUri) },
  });
  return { ...result, isDemo: false };
}
