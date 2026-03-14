import type { VerificationJobInput } from "../../types/github";
import { normalizeCheckSuitePayload } from "../../trustsignal/github";

export function normalizeCheckSuiteEvent(input: {
  action: string | undefined;
  payload: Record<string, any>;
  deliveryId: string;
  installationId: number;
  githubEnterpriseVersion?: string;
}) {
  if (input.action !== "requested" && input.action !== "rerequested") {
    return null;
  }

  const envelope = normalizeCheckSuitePayload(input.payload);
  if (!envelope) {
    return null;
  }

  return {
    deliveryId: input.deliveryId,
    eventName: "check_suite",
    installationId: input.installationId,
    repository: envelope.repository,
    headSha: envelope.headSha,
    externalId: envelope.externalId,
    summaryContext: envelope.summaryContext,
    detailsUrl: envelope.detailsUrl,
    githubEnterpriseVersion: input.githubEnterpriseVersion,
    provenance: {
      ...envelope.provenance,
      githubEnterpriseVersion: input.githubEnterpriseVersion,
    },
  } satisfies VerificationJobInput;
}
