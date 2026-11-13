/**
 * Reusable HTTP client built on fetch.
 *
 *   const items = await apiClient.get<Item[]>('/items');
 *   const created = await apiClient.post<Item>('/items', { name: 'New' });
 *   const result = await apiClient.upload<AnalysisResult>('/analyze', { file });
 *
 * Handles: base URL, JSON, timeouts, HTTP errors (→ ApiError), multipart uploads.
 */
import { API_BASE_URL, API_TIMEOUT_MS } from '@/constants/config';
import type { HttpMethod, JsonValue, UploadFile } from '@/types';

import { ApiError } from './ApiError';

interface RequestOptions {
  headers?: Record<string, string>;
  /** Query string params, e.g. { page: 1 } → ?page=1 */
  params?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

/** Optional auth token provider (e.g. Supabase session). Set once at startup. */
let getAuthToken: (() => Promise<string | null>) | null = null;
export function setAuthTokenProvider(provider: () => Promise<string | null>): void {
  getAuthToken = provider;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const base = API_BASE_URL.replace(/\/+$/, '');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  if (!params) return url;
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return query ? `${url}?${query}` : url;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const { detail } = body as { detail: unknown };
    if (typeof detail === 'string') return detail;
  }
  return `Request failed with status ${status}`;
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: BodyInit,
  options: RequestOptions & { isJson?: boolean } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? API_TIMEOUT_MS);

  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.isJson) headers['Content-Type'] = 'application/json';
  const token = getAuthToken ? await getAuthToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(buildUrl(path, options.params), {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const data = await parseBody(response);
    if (!response.ok) throw new ApiError(extractErrorMessage(data, response.status), response.status, data);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ApiError(aborted ? 'Request timed out' : 'Network request failed', 0);
  } finally {
    clearTimeout(timeout);
  }
}

export const apiClient = {
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>('GET', path, undefined, options);
  },

  post<T>(path: string, data?: JsonValue, options?: RequestOptions): Promise<T> {
    const body = data === undefined ? undefined : JSON.stringify(data);
    return request<T>('POST', path, body, { ...options, isJson: true });
  },

  put<T>(path: string, data?: JsonValue, options?: RequestOptions): Promise<T> {
    const body = data === undefined ? undefined : JSON.stringify(data);
    return request<T>('PUT', path, body, { ...options, isJson: true });
  },

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>('DELETE', path, undefined, options);
  },

  /**
   * multipart/form-data upload (e.g. an image for a FastAPI `UploadFile` param).
   * `files` keys must match the FastAPI parameter names.
   * Do NOT set Content-Type yourself — fetch adds the multipart boundary.
   */
  upload<T>(
    path: string,
    files: Record<string, UploadFile>,
    fields: Record<string, string> = {},
    options?: RequestOptions,
  ): Promise<T> {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => form.append(key, value));
    Object.entries(files).forEach(([key, file]) => {
      // React Native's FormData accepts { uri, name, type } objects for files.
      form.append(key, { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    });
    return request<T>('POST', path, form, options);
  },
};
