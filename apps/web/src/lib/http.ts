/**
 * Longest a request may take, body included: above the API Lambda's 10 s limit plus a cold
 * start, so it only cuts off requests whose answer is not coming (e.g. a stalled connection).
 */
export const REQUEST_TIMEOUT_MS = 15_000;

export interface JsonResponse {
  response: Response;
  /** Parsed body, or undefined if it was not JSON or did not arrive in time. */
  payload: unknown;
  /** Device time when the response headers arrived. */
  receivedAt: number;
}

/**
 * `fetch` plus the JSON body under one time limit. Rejects like `fetch` does (including an
 * AbortError when the limit is reached before the response), so callers treat it as a network error.
 */
export async function fetchJson(input: string, init: RequestInit = {}): Promise<JsonResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const receivedAt = Date.now();
    const payload = await response.json().catch(() => undefined);
    return { response, payload, receivedAt };
  } finally {
    clearTimeout(timer);
  }
}
