/**
 * Reusable HTTP client built on fetch.
 *
 *   const items = await apiClient.get<Item[]>('/items');
 *   const created = await apiClient.post<Item>('/items', { name: 'New' });
 *   const result = await apiClient.upload<AnalysisResult>('/analyze', { file });
 *
 * Handles: base URL, JSON, timeouts, HTTP errors (→ ApiError), multipart uploads.
 */
import { Platform } from 'react-native';

import { API_BASE_URL, API_TIMEOUT_MS } from '@/constants/config';
import type { HttpMethod, JsonValue, UploadFile } from '@/types';

import { ApiError } from './ApiError';
import { i18n } from '@/i18n';

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
  return i18n.t('errors.status', { status });
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: BodyInit,
  options: RequestOptions & { isJson?: boolean } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? API_TIMEOUT_MS);

  const headers = await buildHeaders(options);

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
    throw networkError(method, buildUrl(path, options.params), aborted ? 'timeout' : String(error));
  } finally {
    clearTimeout(timeout);
  }
}

/** Absolute URL for an API path (e.g. a document's fileUrl). Local/absolute URIs are returned unchanged. */
export function resolveApiUrl(pathOrUrl: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(pathOrUrl) ? pathOrUrl : buildUrl(pathOrUrl);
}

/** Auth header for requests made outside apiClient (Image / WebView loading a protected file). */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = getAuthToken ? await getAuthToken() : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function buildHeaders(options: RequestOptions & { isJson?: boolean }): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.isJson) headers['Content-Type'] = 'application/json';
  const token = getAuthToken ? await getAuthToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** status 0 = the request never got an HTTP response (offline, wrong URL, timeout, client error). */
function networkError(method: string, url: string, reason: string): ApiError {
  if (__DEV__) {
    // Shows up in the Metro terminal — the URL the phone actually tried and the raw error.
    console.warn(`[api] ${method} ${url} failed:`, reason);
  }
  return new ApiError(reason === 'timeout' ? i18n.t('errors.timeout') : i18n.t('errors.networkFailed'), 0);
}

/**
 * Native multipart upload via React Native's XMLHttpRequest.
 * Since SDK 52+ the global `fetch` is expo/fetch, which rejects RN-style `{ uri, name, type }`
 * FormData parts ("Unsupported FormDataPart implementation"). RN's XHR streams the file from its uri.
 */
async function uploadNative<T>(path: string, form: FormData, options: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.params);
  const headers = await buildHeaders(options); // no Content-Type: XHR adds the multipart boundary
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.timeout = options.timeoutMs ?? API_TIMEOUT_MS;
    xhr.onload = () => {
      let data: unknown = null;
      if (xhr.responseText) {
        try {
          data = JSON.parse(xhr.responseText) as unknown;
        } catch {
          data = xhr.responseText;
        }
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(extractErrorMessage(data, xhr.status), xhr.status, data));
    };
    xhr.onerror = () => reject(networkError('POST', url, 'XHR network error'));
    xhr.ontimeout = () => reject(networkError('POST', url, 'timeout'));
    xhr.send(form);
  });
}

// Identical GETs already in flight share one network request (several screens mounting together).
const pendingGets = new Map<string, Promise<unknown>>();

export const apiClient = {
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    if (options?.headers) return request<T>('GET', path, undefined, options);
    const key = buildUrl(path, options?.params);
    const pending = pendingGets.get(key);
    if (pending) return pending as Promise<T>;
    const promise = request<T>('GET', path, undefined, options).finally(() => pendingGets.delete(key));
    pendingGets.set(key, promise);
    return promise;
  },

  post<T>(path: string, data?: JsonValue, options?: RequestOptions): Promise<T> {
    const body = data === undefined ? undefined : JSON.stringify(data);
    return request<T>('POST', path, body, { ...options, isJson: true });
  },

  patch<T>(path: string, data?: JsonValue, options?: RequestOptions): Promise<T> {
    const body = data === undefined ? undefined : JSON.stringify(data);
    return request<T>('PATCH', path, body, { ...options, isJson: true });
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
   * Do NOT set Content-Type yourself — the multipart boundary is added automatically.
   * Web: fetch + Blob. iOS/Android: XMLHttpRequest with `{ uri, name, type }` parts.
   */
  async upload<T>(
    path: string,
    files: Record<string, UploadFile>,
    fields: Record<string, string> = {},
    options?: RequestOptions,
  ): Promise<T> {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => form.append(key, value));
    if (Platform.OS === 'web') {
      // Browsers need a real Blob (the picker gives a blob:/data: URI).
      for (const [key, file] of Object.entries(files)) {
        form.append(key, await (await fetch(file.uri)).blob(), file.name);
      }
      return request<T>('POST', path, form, options);
    }
    Object.entries(files).forEach(([key, file]) => {
      // React Native's FormData accepts { uri, name, type } objects for files.
      form.append(key, { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    });
    return uploadNative<T>(path, form, options);
  },
};
