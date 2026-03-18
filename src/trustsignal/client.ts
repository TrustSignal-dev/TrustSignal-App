import { trustSignalVerificationRequestSchema, trustSignalVerificationResponseSchema, type TrustSignalVerificationRequest, type TrustSignalVerificationResponse } from "./types";

export interface TrustSignalClientConfig {
  apiBaseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  headers?: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
}

export interface FetchLike {
  (
    input: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body: string;
      signal: AbortSignal;
    }
  ): Promise<FetchLikeResponse>;
}

export class TrustSignalVerificationClient {
  private readonly baseUrl: string;
  private readonly candidatePaths = ["/api/v1/verifications/github", "/v1/verifications/github"] as const;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(config: TrustSignalClientConfig, fetchImpl = globalThis.fetch as FetchLike) {
    this.baseUrl = config.apiBaseUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.fetchImpl = fetchImpl;
    this.apiKey = config.apiKey;
  }

  private readonly apiKey: string;

  async verify(request: TrustSignalVerificationRequest): Promise<TrustSignalVerificationResponse> {
    const payload = trustSignalVerificationRequestSchema.parse(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const payloadText = JSON.stringify(payload);
    let lastError: string | null = null;

    try {
      for (const candidatePath of this.candidatePaths) {
        const endpoint = `${this.baseUrl}${candidatePath}`;
        const response = await this.fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "accept": "application/json",
            "x-api-key": this.apiKey,
          },
          body: payloadText,
          signal: controller.signal,
        });

        const text = await response.text();
        const contentType = response.headers?.get("content-type") ?? "";
        const isJson = contentType.includes("application/json") || looksLikeJson(text);
        const preview = text.slice(0, 120);

        if (!isJson) {
          if (response.status === 404 && this.canFallback(candidatePath)) {
            lastError = `TrustSignal verification endpoint mismatch for ${endpoint}: response is not JSON`;
            continue;
          }

          throw new Error(
            `TrustSignal verification response for ${endpoint} was not JSON (content-type: ${contentType || "missing"}, status: ${response.status}, body: ${preview})`
          );
        }

        let parsed: unknown;
        try {
          parsed = text ? (JSON.parse(text) as unknown) : {};
        } catch {
          if (response.status === 404 && this.canFallback(candidatePath)) {
            lastError = `TrustSignal verification endpoint mismatch for ${endpoint}: response body is not valid JSON (status ${response.status})`;
            continue;
          }

          throw new Error(`TrustSignal verification response from ${endpoint} could not be parsed as JSON`);
        }

        if (!response.ok) {
          if (response.status === 404 && this.canFallback(candidatePath)) {
            lastError = `TrustSignal verification request to ${endpoint} returned HTTP ${response.status}: ${preview}`;
            continue;
          }

          throw new Error(
            `TrustSignal verification request failed with status ${response.status} on ${endpoint}: ${typeof parsed === "object" && parsed !== null && "error" in parsed ? (parsed as Record<string, unknown>).error : preview}`
          );
        }

        return trustSignalVerificationResponseSchema.parse(parsed);
      }

      throw new Error(lastError ?? "TrustSignal verification request failed on all configured endpoint variants");
    } finally {
      clearTimeout(timeout);
    }
  }

  private canFallback(path: (typeof this.candidatePaths)[number]) {
    return path === "/api/v1/verifications/github";
  }
}

function looksLikeJson(value: string) {
  const text = value.trim();
  return text.startsWith("{") || text.startsWith("[");
}
