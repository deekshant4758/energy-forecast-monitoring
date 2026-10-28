import type {
  AccuracyResponse,
  DeskResponse,
  IngestionResponse,
  MetaResponse,
} from "./types";

/**
 * Requests go to the same origin under /api: Vite proxies them in development
 * and nginx proxies them in the container, so there is no CORS configuration to
 * keep in sync and no backend host baked into the bundle.
 */
const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    ...init,
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // Body was not JSON; keep the status line.
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}

export interface DeskQuery {
  from: string;
  to: string;
  horizon: number;
  resolution: string;
}

export const api = {
  meta: (signal?: AbortSignal) => request<MetaResponse>("/api/meta", { signal }),

  desk: (query: DeskQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      horizon: String(query.horizon),
      resolution: query.resolution,
    });
    return request<DeskResponse>(`/api/desk?${params}`, { signal });
  },

  accuracy: (
    query: { from: string; to: string; horizon: number },
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      horizon: String(query.horizon),
    });
    return request<AccuracyResponse>(`/api/accuracy?${params}`, { signal });
  },

  ingestion: (signal?: AbortSignal) =>
    request<IngestionResponse>("/api/ingestion", { signal }),

  refresh: () =>
    request<{ status: string; actual_rows: number; forecast_rows: number }>(
      "/api/ingest/refresh",
      { method: "POST" },
    ),
};
