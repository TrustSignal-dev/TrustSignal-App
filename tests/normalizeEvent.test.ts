import { describe, expect, it } from "vitest";
import { normalizeWorkflowRunEvent } from "../src/webhooks/handlers/workflowRun";
import { normalizePushPayload, normalizeCheckSuitePayload } from "../src/trustsignal/github";

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

describe("normalizePushPayload", () => {
  it("returns null for branch deletion events (zero SHA)", () => {
    const result = normalizePushPayload({
      ref: "refs/heads/main",
      before: "abc1234def5678901234567890abcdef12345678",
      after: "0000000000000000000000000000000000000000",
      repository: {
        name: "repo",
        default_branch: "main",
        html_url: "https://github.com/acme/repo",
        owner: { login: "acme" },
      },
    });

    expect(result).toBeNull();
  });

  it("returns null when after is missing", () => {
    const result = normalizePushPayload({
      ref: "refs/heads/main",
      before: "abc1234def5678901234567890abcdef12345678",
      repository: {
        name: "repo",
        default_branch: "main",
        html_url: "https://github.com/acme/repo",
        owner: { login: "acme" },
      },
    });

    expect(result).toBeNull();
  });

  it("returns an envelope for a default-branch push with a valid SHA", () => {
    const result = normalizePushPayload({
      ref: "refs/heads/main",
      before: "abc1234def5678901234567890abcdef12345678",
      after: "def5678abc1234901234567890abcdef12345678",
      repository: {
        name: "repo",
        default_branch: "main",
        html_url: "https://github.com/acme/repo",
        owner: { login: "acme" },
      },
    });

    expect(result).not.toBeNull();
    expect(result?.headSha).toBe("def5678abc1234901234567890abcdef12345678");
    expect(result?.externalId).toBe("push:def5678abc1234901234567890abcdef12345678");
  });
});

describe("normalizeCheckSuitePayload", () => {
  it("uses html_url for detailsUrl when available", () => {
    const result = normalizeCheckSuitePayload({
      action: "requested",
      check_suite: {
        id: 321,
        head_sha: "def5678abc1234901234567890abcdef12345678",
        status: "queued",
        conclusion: null,
        html_url: "https://github.com/acme/repo/actions/runs/321",
        url: "https://api.github.com/repos/acme/repo/check-suites/321",
        app: { slug: "some-app" },
        pull_requests: [],
      },
      repository: {
        id: 1,
        name: "repo",
        default_branch: "main",
        html_url: "https://github.com/acme/repo",
        owner: { login: "acme" },
      },
    });

    expect(result).not.toBeNull();
    expect(result?.detailsUrl).toBe("https://github.com/acme/repo/actions/runs/321");
  });

  it("falls back to commit URL for detailsUrl when html_url is absent", () => {
    const result = normalizeCheckSuitePayload({
      action: "requested",
      check_suite: {
        id: 654,
        head_sha: "abc1234def5678901234567890abcdef12345678",
        status: "queued",
        conclusion: null,
        url: "https://api.github.com/repos/acme/repo/check-suites/654",
        app: { slug: "some-app" },
        pull_requests: [],
      },
      repository: {
        id: 1,
        name: "repo",
        default_branch: "main",
        html_url: "https://github.com/acme/repo",
        owner: { login: "acme" },
      },
    });

    expect(result).not.toBeNull();
    expect(result?.detailsUrl).toBe("https://github.com/acme/repo/commit/abc1234def5678901234567890abcdef12345678");
  });
});
