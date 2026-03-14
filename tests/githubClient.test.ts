import { describe, expect, it, vi } from "vitest";
import { GitHubAppAuth } from "../src/github/auth";
import { GitHubApiClient, shouldRetryGitHubRequest } from "../src/github/client";
import { resolveGitHubRuntimeConfig } from "../src/github/config";

describe("GitHub runtime config", () => {
  it("uses GitHub Cloud defaults", () => {
    const config = resolveGitHubRuntimeConfig({
      GITHUB_APP_NAME: "TrustSignal",
      GITHUB_API_BASE_URL: undefined,
      GITHUB_GRAPHQL_BASE_URL: undefined,
      GITHUB_WEB_BASE_URL: undefined,
    });

    expect(config.apiBaseUrl).toBe("https://api.github.com");
    expect(config.graphqlBaseUrl).toBe("https://api.github.com/graphql");
    expect(config.webBaseUrl).toBe("https://github.com");
  });

  it("supports GHES base URLs", () => {
    const config = resolveGitHubRuntimeConfig({
      GITHUB_APP_NAME: "TrustSignal",
      GITHUB_API_BASE_URL: "https://ghe.example.com/api/v3",
      GITHUB_GRAPHQL_BASE_URL: undefined,
      GITHUB_WEB_BASE_URL: undefined,
    });

    expect(config.apiBaseUrl).toBe("https://ghe.example.com/api/v3");
    expect(config.graphqlBaseUrl).toBe("https://ghe.example.com/api/v3/graphql");
    expect(config.webBaseUrl).toBe("https://ghe.example.com");
  });
});

describe("GitHubApiClient", () => {
  it("retries rate-limited requests and exposes GHES version metadata", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce({
        status: 429,
        response: {
          headers: {
            "retry-after": "0",
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 1,
        },
        headers: {
          "x-github-enterprise-version": "3.14.0",
        },
      });
    const auth = {
      createAppJwt: vi.fn().mockReturnValue("app-jwt"),
      getInstallationToken: vi.fn().mockResolvedValue("installation-token"),
    } as unknown as GitHubAppAuth;
    const client = new GitHubApiClient(
      {
        GITHUB_APP_NAME: "TrustSignal",
        GITHUB_API_BASE_URL: "https://ghe.example.com/api/v3",
        GITHUB_GRAPHQL_BASE_URL: "https://ghe.example.com/api/v3/graphql",
        GITHUB_WEB_BASE_URL: "https://ghe.example.com",
      },
      auth,
      () => ({ request }),
      vi.fn().mockResolvedValue(undefined)
    );

    const response = await client.githubRequest<{ id: number }>("GET /repos/{owner}/{repo}", { owner: "acme", repo: "repo" }, { installationId: 7 });

    expect(response.data.id).toBe(1);
    expect(response.githubEnterpriseVersion).toBe("3.14.0");
    expect(request).toHaveBeenCalledTimes(2);
    expect(auth.getInstallationToken).toHaveBeenCalledWith(7, expect.any(Function));
  });

  it("creates installation access tokens through the app client", async () => {
    const appRequest = vi.fn().mockResolvedValue({
      data: {
        token: "installation-token",
        expires_at: "2026-03-14T12:00:00.000Z",
      },
      headers: {},
    });
    const installationRequest = vi.fn().mockResolvedValue({
      data: { ok: true },
      headers: {},
    });
    const auth = new GitHubAppAuth({
      GITHUB_APP_ID: "12345",
      GITHUB_PRIVATE_KEY_PEM: "-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----",
    });
    const createAppJwt = vi.spyOn(auth, "createAppJwt").mockReturnValue("app-jwt");
    const factory = vi
      .fn()
      .mockImplementationOnce(() => ({ request: appRequest }))
      .mockImplementationOnce(() => ({ request: installationRequest }));
    const client = new GitHubApiClient(
      {
        GITHUB_APP_NAME: "TrustSignal",
        GITHUB_API_BASE_URL: "https://api.github.com",
        GITHUB_GRAPHQL_BASE_URL: "https://api.github.com/graphql",
        GITHUB_WEB_BASE_URL: "https://github.com",
      },
      auth,
      factory
    );

    await client.githubRequest("GET /repos/{owner}/{repo}", { owner: "acme", repo: "repo" }, { installationId: 9 });

    expect(createAppJwt).toHaveBeenCalled();
    expect(appRequest).toHaveBeenCalledWith("POST /app/installations/{installation_id}/access_tokens", {
      installation_id: 9,
    });
    expect(installationRequest).toHaveBeenCalledWith("GET /repos/{owner}/{repo}", {
      owner: "acme",
      repo: "repo",
    });
  });
});

describe("shouldRetryGitHubRequest", () => {
  it("retries transient GitHub API status codes only", () => {
    expect(shouldRetryGitHubRequest(429)).toBe(true);
    expect(shouldRetryGitHubRequest(503)).toBe(true);
    expect(shouldRetryGitHubRequest(404)).toBe(false);
  });
});
