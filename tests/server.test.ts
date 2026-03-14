import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createGitHubWebhookHandler } from "../src/server";
import { computeGitHubSignature } from "../src/webhooks/verifySignature";
import { createInternalApiKeyMiddleware } from "../src/routes/github";

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function createServices() {
  return {
    env: {
      NODE_ENV: "test",
      PORT: 3000,
      GITHUB_APP_ID: "123",
      GITHUB_APP_NAME: "TrustSignal",
      GITHUB_WEBHOOK_SECRET: "secret",
      GITHUB_PRIVATE_KEY: "private-key",
      GITHUB_PRIVATE_KEY_PEM: "private-key",
      GITHUB_API_BASE_URL: "https://api.github.com",
      GITHUB_GRAPHQL_BASE_URL: "https://api.github.com/graphql",
      GITHUB_WEB_BASE_URL: "https://github.com",
      TRUSTSIGNAL_API_BASE_URL: "https://trustsignal.example.com",
      TRUSTSIGNAL_API_KEY: "trustsignal-api-key",
      INTERNAL_API_KEY: "internal-key",
      LOG_LEVEL: "info",
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    replayStore: {
      begin: vi.fn().mockReturnValue("started"),
      complete: vi.fn(),
      release: vi.fn(),
    },
    githubClient: {
      listInstallations: vi.fn().mockResolvedValue([]),
      getWorkflowRun: vi.fn().mockResolvedValue({
        data: {
          id: 101,
          status: "completed",
          conclusion: "success",
          head_sha: "abc123",
          html_url: "https://github.com/acme/repo/actions/runs/101",
          name: "CI",
          event: "push",
        },
        githubEnterpriseVersion: undefined,
      }),
      getRelease: vi.fn(),
      getCommit: vi.fn(),
      createCheckRun: vi.fn().mockResolvedValue({ id: 1, html_url: "https://github.com/checks/1", status: "completed", conclusion: "success" }),
      updateCheckRun: vi.fn().mockResolvedValue({ id: 1, html_url: "https://github.com/checks/1", status: "completed", conclusion: "success" }),
    },
    verificationService: {
      verify: vi.fn().mockResolvedValue({
        status: "completed",
        conclusion: "success",
        title: "Artifact verification completed",
        summary: "Verification succeeded",
        detailsUrl: "https://trustsignal.example.com/receipts/rcpt_1",
        receiptId: "rcpt_1",
        verificationTimestamp: "2026-03-13T00:00:00.000Z",
        provenanceNote: "workflow_run event",
      }),
    },
  } as any;
}

describe("route handlers", () => {
  it("accepts a valid signed webhook", async () => {
    const services = createServices();
    const handler = createGitHubWebhookHandler(services);
    const raw = fs.readFileSync(path.join(__dirname, "fixtures", "workflowRun.completed.json"));
    const signature = computeGitHubSignature("secret", raw);
    const req = {
      body: raw,
      is: vi.fn().mockReturnValue(true),
      header: vi.fn((name: string) => {
        const headers: Record<string, string> = {
          "x-github-event": "workflow_run",
          "x-github-delivery": "delivery-1",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        };
        return headers[name.toLowerCase()] || headers[name] || undefined;
      }),
    } as any;
    const res = createMockResponse();
    const next = vi.fn();

    await handler(req, res as any, next);

    expect(res.statusCode).toBe(202);
    expect(next).not.toHaveBeenCalled();
    expect(services.replayStore.complete).toHaveBeenCalledWith("delivery-1");
  });

  it("rejects an invalid signature", async () => {
    const services = createServices();
    const handler = createGitHubWebhookHandler(services);
    const req = {
      body: Buffer.from(JSON.stringify({ installation: { id: 1 } })),
      is: vi.fn().mockReturnValue(true),
      header: vi.fn((name: string) => {
        const headers: Record<string, string> = {
          "x-github-event": "push",
          "x-github-delivery": "delivery-2",
          "x-hub-signature-256": "sha256=bad",
          "content-type": "application/json",
        };
        return headers[name.toLowerCase()] || headers[name] || undefined;
      }),
    } as any;
    const res = createMockResponse();

    await handler(req, res as any, vi.fn());

    expect(res.statusCode).toBe(401);
  });

  it("rejects a missing signature", async () => {
    const services = createServices();
    const handler = createGitHubWebhookHandler(services);
    const req = {
      body: Buffer.from(JSON.stringify({ installation: { id: 1 } })),
      is: vi.fn().mockReturnValue(true),
      header: vi.fn((name: string) => {
        const headers: Record<string, string> = {
          "x-github-event": "push",
          "x-github-delivery": "delivery-4",
          "content-type": "application/json",
        };
        return headers[name.toLowerCase()] || headers[name] || undefined;
      }),
    } as any;
    const res = createMockResponse();

    await handler(req, res as any, vi.fn());

    expect(res.statusCode).toBe(403);
  });

  it("requires internal auth for installations", () => {
    const middleware = createInternalApiKeyMiddleware("internal-key");
    const req = {
      header: vi.fn().mockReturnValue(undefined),
    } as any;
    const next = vi.fn();

    middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401, code: "unauthorized" });
  });

  it("rejects replayed deliveries", async () => {
    const services = createServices();
    services.replayStore.begin = vi.fn().mockReturnValue("completed");
    const handler = createGitHubWebhookHandler(services);
    const payload = {
      installation: { id: 123 },
      repository: {
        name: "repo",
        default_branch: "main",
        html_url: "https://github.com/acme/repo",
        owner: { login: "acme" },
      },
      ref: "refs/heads/main",
      before: "abc1234",
      after: "def5678",
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const signature = computeGitHubSignature("secret", raw);
    const req = {
      body: raw,
      is: vi.fn().mockReturnValue(true),
      header: vi.fn((name: string) => {
        const headers: Record<string, string> = {
          "x-github-event": "push",
          "x-github-delivery": "delivery-3",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        };
        return headers[name.toLowerCase()] || headers[name] || undefined;
      }),
    } as any;
    const res = createMockResponse();
    const next = vi.fn();

    await handler(req, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(services.replayStore.release).not.toHaveBeenCalled();
  });

  it("rejects deliveries already in progress", async () => {
    const services = createServices();
    services.replayStore.begin = vi.fn().mockReturnValue("in_flight");
    const handler = createGitHubWebhookHandler(services);
    const payload = {
      installation: { id: 123 },
      repository: {
        name: "repo",
        default_branch: "main",
        html_url: "https://github.com/acme/repo",
        owner: { login: "acme" },
      },
      ref: "refs/heads/main",
      before: "abc1234",
      after: "def5678",
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const signature = computeGitHubSignature("secret", raw);
    const req = {
      body: raw,
      is: vi.fn().mockReturnValue(true),
      header: vi.fn((name: string) => {
        const headers: Record<string, string> = {
          "x-github-event": "push",
          "x-github-delivery": "delivery-in-flight",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        };
        return headers[name.toLowerCase()] || headers[name] || undefined;
      }),
    } as any;
    const next = vi.fn();

    await handler(req, createMockResponse() as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "delivery_in_progress" }));
    expect(services.replayStore.release).not.toHaveBeenCalled();
  });

  it("releases a delivery after processing failure so retries can continue", async () => {
    const services = createServices();
    services.verificationService.verify = vi.fn().mockRejectedValue(new Error("trustsignal unavailable"));
    const handler = createGitHubWebhookHandler(services);
    const raw = fs.readFileSync(path.join(__dirname, "fixtures", "workflowRun.completed.json"));
    const signature = computeGitHubSignature("secret", raw);
    const req = {
      body: raw,
      is: vi.fn().mockReturnValue(true),
      header: vi.fn((name: string) => {
        const headers: Record<string, string> = {
          "x-github-event": "workflow_run",
          "x-github-delivery": "delivery-failure",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        };
        return headers[name.toLowerCase()] || headers[name] || undefined;
      }),
    } as any;
    const next = vi.fn();

    await handler(req, createMockResponse() as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(services.replayStore.release).toHaveBeenCalledWith("delivery-failure");
    expect(services.replayStore.complete).not.toHaveBeenCalled();
  });

  it("rejects missing installation ids", async () => {
    const services = createServices();
    const handler = createGitHubWebhookHandler(services);
    const raw = Buffer.from(
      JSON.stringify({
        repository: {
          name: "repo",
          owner: { login: "acme" },
        },
      })
    );
    const signature = computeGitHubSignature("secret", raw);
    const req = {
      body: raw,
      is: vi.fn().mockReturnValue(true),
      header: vi.fn((name: string) => {
        const headers: Record<string, string> = {
          "x-github-event": "push",
          "x-github-delivery": "delivery-5",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        };
        return headers[name.toLowerCase()] || headers[name] || undefined;
      }),
    } as any;
    const next = vi.fn();

    await handler(req, createMockResponse() as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "missing_installation_id" }));
  });

  it("rejects unsupported events", async () => {
    const services = createServices();
    const handler = createGitHubWebhookHandler(services);
    const raw = Buffer.from(JSON.stringify({ installation: { id: 1 } }));
    const signature = computeGitHubSignature("secret", raw);
    const req = {
      body: raw,
      is: vi.fn().mockReturnValue(true),
      header: vi.fn((name: string) => {
        const headers: Record<string, string> = {
          "x-github-event": "repository",
          "x-github-delivery": "delivery-6",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        };
        return headers[name.toLowerCase()] || headers[name] || undefined;
      }),
    } as any;
    const next = vi.fn();

    await handler(req, createMockResponse() as any, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "unsupported_event" }));
  });
});
