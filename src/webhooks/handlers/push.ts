import type { VerificationJobInput } from "../../types/github";
import { normalizePushPayload } from "../../trustsignal/github";

export function normalizePushEvent(parsed: {
  deliveryId: string;
  installationId: number;
  githubEnterpriseVersion?: string;
  payload: Record<string, any>;
}): VerificationJobInput | null {
  const envelope = normalizePushPayload(parsed.payload);
  if (!envelope) {
    return null;
  }

  return {
    deliveryId: parsed.deliveryId,
    eventName: "push",
    installationId: parsed.installationId,
    repository: envelope.repository,
    headSha: envelope.headSha,
    externalId: envelope.externalId,
    summaryContext: envelope.summaryContext,
    detailsUrl: envelope.detailsUrl,
    githubEnterpriseVersion: parsed.githubEnterpriseVersion,
    provenance: {
      ...envelope.provenance,
      githubEnterpriseVersion: parsed.githubEnterpriseVersion,
    },
  };
}
