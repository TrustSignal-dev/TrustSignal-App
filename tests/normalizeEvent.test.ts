import { describe, expect, it } from "vitest";
import { normalizeWorkflowRunEvent } from "../src/webhooks/handlers/workflowRun";

describe("normalizeWorkflowRunEvent", () => {
  it("normalizes a completed workflow run", () => {
    const job = normalizeWorkflowRunEvent({
      deliveryId: "delivery-1",
      installationId: 99,
      payload: {
        repository: {
          name: "repo",
          default_branch: "main",
          html_url: "https://github.com/acme/repo",
          owner: { login: "acme" },
        },
        workflow_run: {
          id: 101,
          status: "completed",
          conclusion: "success",
          head_sha: "abc123",
          html_url: "https://github.com/acme/repo/actions/runs/101",
          name: "CI",
          event: "push",
        },
      },
    });

    expect(job?.externalId).toBe("workflow_run:101");
    expect(job?.headSha).toBe("abc123");
  });
});
