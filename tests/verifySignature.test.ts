import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeGitHubSignature, verifyGitHubWebhookSignature } from "../src/webhooks/verifySignature";

describe("verifyGitHubWebhookSignature", () => {
  it("accepts a valid signature for the raw webhook body fixture", () => {
    const body = fs.readFileSync(path.join(__dirname, "fixtures", "workflowRun.completed.json"));
    const signature = computeGitHubSignature("secret", body);

    expect(verifyGitHubWebhookSignature("secret", body, signature)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));

    expect(verifyGitHubWebhookSignature("secret", body, "sha256=bad")).toBe(false);
  });
});
