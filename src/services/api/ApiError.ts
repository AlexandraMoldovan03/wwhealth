/** Error thrown by the API client for any failed request. */
export class ApiError extends Error {
  /** HTTP status code, or 0 for network / timeout errors. */
  readonly status: number;
  /** Parsed response body, if any (FastAPI puts details in `detail`). */
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** Message safe to show in the UI. */
  get userMessage(): string {
    if (this.isNetworkError) return 'Cannot reach the server. Check your connection and API_BASE_URL.';
    if (this.status === 401 || this.status === 403) return 'You are not allowed to do this.';
    if (this.status === 404) return 'The requested resource was not found.';
    if (this.status === 422) return 'The server rejected the data that was sent.';
    if (this.status >= 500) return 'The server had a problem. Please try again later.';
    return this.message;
  }
}
