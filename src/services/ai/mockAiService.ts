/** DEMO ONLY — returns simulated AI results. Safe to delete once the real backend exists. */
import { MOCK_DELAY_MS } from '@/constants/config';
import type { AnalysisResult } from '@/types';
import { createId, delay } from '@/utils/async';

const DEMO_LABELS = ['Person', 'Laptop', 'Coffee cup', 'Plant', 'Book', 'Phone', 'Desk', 'Window'];

function pickLabels(count: number) {
  const shuffled = [...DEMO_LABELS].sort(() => Math.random() - 0.5);
  return shuffled
    .slice(0, count)
    .map((label) => ({ label, confidence: 0.55 + Math.random() * 0.44 }))
    .sort((a, b) => b.confidence - a.confidence);
}

export async function mockAnalyzeImage(_imageUri: string): Promise<AnalysisResult> {
  const started = Date.now();
  await delay(MOCK_DELAY_MS + 600);
  const labels = pickLabels(4);
  return {
    id: createId('analysis'),
    createdAt: new Date().toISOString(),
    summary: `Simulated result: the image probably contains a ${labels[0].label.toLowerCase()}.`,
    labels,
    processingTimeMs: Date.now() - started,
    model: 'demo-model-v0',
    isDemo: true,
  };
}
