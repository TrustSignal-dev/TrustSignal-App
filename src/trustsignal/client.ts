import { trustSignalVerificationRequestSchema, trustSignalVerificationResponseSchema, type TrustSignalVerificationRequest, type TrustSignalVerificationResponse } from "./types";

export interface TrustSignalClientConfig {
  apiBaseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
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

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v1/verifications/github`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await response.text();
      const parsed = text ? (JSON.parse(text) as unknown) : {};

      if (!response.ok) {
        throw new Error(`TrustSignal verification request failed with status ${response.status}`);
      }

      return trustSignalVerificationResponseSchema.parse(parsed);
    } finally {
      clearTimeout(timeout);
    }
  }
}
