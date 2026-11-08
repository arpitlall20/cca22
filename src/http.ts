export class HttpError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined | null | Array<string | number>>;
  body?: unknown;
  timeoutMs?: number;
};

function withQuery(url: string, query?: RequestOptions["query"]): string {
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(options.headers ?? {}) };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const response = await fetch(withQuery(url, options.query), {
      method: options.method ?? "GET",
      headers,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new HttpError(response.status, text, `HTTP ${response.status} ${options.method ?? "GET"} ${url}`);
    }
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  } finally {
    clearTimeout(timer);
  }
}

export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["items", "records", "people", "data", "results", "value"]) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }
  return [];
}

export function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

export function pickNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return undefined;
}
