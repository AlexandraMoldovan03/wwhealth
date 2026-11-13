/** History data: mock today, FastAPI `GET /history` later. */
import { MOCK_DELAY_MS, USE_MOCK_API } from '@/constants/config';
import { HISTORY_ITEMS } from '@/data/history';
import type { HistoryItem } from '@/types';
import { delay } from '@/utils/async';

import { ApiError } from './api/ApiError';
import { apiClient } from './api/client';
import { ENDPOINTS } from './api/endpoints';

/** Example GET (list). */
export async function getHistory(): Promise<HistoryItem[]> {
  if (USE_MOCK_API) {
    await delay(MOCK_DELAY_MS);
    return HISTORY_ITEMS;
  }
  return apiClient.get<HistoryItem[]>(ENDPOINTS.history);
}

/** Example GET (single item). */
export async function getHistoryItem(id: string): Promise<HistoryItem> {
  if (USE_MOCK_API) {
    await delay(MOCK_DELAY_MS / 2);
    const item = HISTORY_ITEMS.find((h) => h.id === id);
    if (!item) throw new ApiError('Item not found', 404);
    return item;
  }
  return apiClient.get<HistoryItem>(ENDPOINTS.historyItem(id));
}

/** Example POST — create a history entry on the backend. */
export async function createHistoryItem(input: Pick<HistoryItem, 'title' | 'description'>): Promise<HistoryItem> {
  if (USE_MOCK_API) {
    await delay(MOCK_DELAY_MS);
    return {
      id: `h_${Date.now()}`,
      ...input,
      date: new Date().toISOString(),
      status: 'processing',
      icon: 'time-outline',
      details: {},
    };
  }
  return apiClient.post<HistoryItem>(ENDPOINTS.history, input);
}
