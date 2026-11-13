/** All backend paths in one place. Add new FastAPI routes here. */
export const ENDPOINTS = {
  health: '/health',
  analyzeImage: '/ai/analyze-image',
  history: '/history',
  historyItem: (id: string) => `/history/${encodeURIComponent(id)}`,
} as const;
