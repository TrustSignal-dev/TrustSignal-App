import type { AppEnv } from "../config/env";
import { TrustSignalVerificationClient } from "../trustsignal/client";
import {
  buildTrustSignalVerificationRequest,
  mapVerificationJobToEnvelope,
  type TrustSignalVerificationService,
} from "../trustsignal/types";
import type { VerificationJobInput } from "../types/github";

export { type TrustSignalVerificationService } from "../trustsignal/types";

export class TrustSignalApiVerificationService implements TrustSignalVerificationService {
  private readonly client: TrustSignalVerificationClient;

  constructor(env: Pick<AppEnv, "TRUSTSIGNAL_API_BASE_URL" | "TRUSTSIGNAL_API_KEY">, client?: TrustSignalVerificationClient) {
    this.client = client ?? new TrustSignalVerificationClient({
      apiBaseUrl: env.TRUSTSIGNAL_API_BASE_URL,
      apiKey: env.TRUSTSIGNAL_API_KEY,
    });
  }

  async verify(job: VerificationJobInput) {
    const request = buildTrustSignalVerificationRequest(mapVerificationJobToEnvelope(job));
    return this.client.verify(request);
  }
}
