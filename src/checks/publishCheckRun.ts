import type { CheckRunRequest } from "../types/github";
import type { GitHubApiClient } from "../github/client";

export function buildCheckRunPayload(input: CheckRunRequest) {
  const payload = {
    external_id: input.externalId,
    status: input.status,
    details_url: input.detailsUrl,
    output: {
      title: input.title,
      summary: input.summary,
      text: [
        input.receiptId ? `Receipt ID: ${input.receiptId}` : undefined,
        `Verified at: ${input.verificationTimestamp}`,
        `Provenance: ${input.provenanceNote}`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  } as const;

  if (input.status === "completed") {
    return {
      ...payload,
      conclusion: input.conclusion ?? "neutral",
    };
  }

  return payload;
}

export async function publishCheckRun(client: GitHubApiClient, input: CheckRunRequest) {
  const payload = buildCheckRunPayload(input);

  if (input.checkRunId) {
    return client.updateCheckRun(input.installationId, input.owner, input.repo, input.checkRunId, payload);
  }

  return client.createCheckRun(input.installationId, input.owner, input.repo, {
    name: "TrustSignal Verification",
    head_sha: input.headSha,
    ...payload,
  });
}
