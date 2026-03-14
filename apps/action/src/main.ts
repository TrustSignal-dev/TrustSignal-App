import { appendFileSync } from "node:fs";
import { TrustSignalVerificationClient } from "../../../src/trustsignal/client";
import { normalizeGitHubEventToEnvelope } from "../../../src/trustsignal/github";
import { buildTrustSignalVerificationRequest } from "../../../src/trustsignal/types";
import { parseActionEnv, readGitHubEventPayload } from "./env";

function setOutput(name: string, value: string) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

export async function runAction(envInput = process.env) {
  const env = parseActionEnv(envInput);
  const payload = readGitHubEventPayload(env.GITHUB_EVENT_PATH);
  const envelope = normalizeGitHubEventToEnvelope({
    eventName: env.GITHUB_EVENT_NAME,
    action: typeof payload.action === "string" ? payload.action : undefined,
    payload,
  });

  if (!envelope) {
    throw new Error(`GitHub event ${env.GITHUB_EVENT_NAME} is not eligible for TrustSignal verification`);
  }

  const client = new TrustSignalVerificationClient({
    apiBaseUrl: env.TRUSTSIGNAL_API_BASE_URL,
    apiKey: env.TRUSTSIGNAL_API_KEY,
  });
  const request = buildTrustSignalVerificationRequest(envelope);
  const result = await client.verify(request);

  if (result.receiptId) {
    setOutput("receipt_id", result.receiptId);
  }

  setOutput("verification_status", result.status);

  return { request, result };
}

if (require.main === module) {
  runAction().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
