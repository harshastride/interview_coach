/**
 * Shared fetch wrapper that always includes credentials and CSRF headers.
 * All frontend API calls should use these helpers.
 */

const BASE_HEADERS: Record<string, string> = {
  'X-Requested-With': 'XMLHttpRequest',
};

const JSON_HEADERS: Record<string, string> = {
  ...BASE_HEADERS,
  'Content-Type': 'application/json',
};

/** GET request with credentials */
export async function apiGet<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: BASE_HEADERS,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || res.statusText);
  }
  return res.json();
}

/** POST request with JSON body and credentials */
export async function apiPost<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_HEADERS,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || res.statusText, data);
  }
  return res.json();
}

/** PATCH request with JSON body and credentials */
export async function apiPatch<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || res.statusText, data);
  }
  return res.json();
}

/** DELETE request with credentials */
export async function apiDelete<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
    headers: JSON_HEADERS,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || res.statusText, data);
  }
  return res.json();
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}
