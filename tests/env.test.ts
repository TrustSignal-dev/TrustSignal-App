import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env";

describe("parseEnv", () => {
  it("parses a valid environment", () => {
    const env = parseEnv({
      NODE_ENV: "test",
      PORT: "3000",
      GITHUB_APP_ID: "123",
      GITHUB_APP_NAME: "TrustSignal",
      GITHUB_WEBHOOK_SECRET: "secret",
      GITHUB_PRIVATE_KEY_PEM: "-----BEGIN RSA PRIVATE KEY-----\\nkey\\n-----END RSA PRIVATE KEY-----",
      GITHUB_API_BASE_URL: "https://api.github.com",
      GITHUB_GRAPHQL_BASE_URL: "https://api.github.com/graphql",
      GITHUB_WEB_BASE_URL: "https://github.com",
      TRUSTSIGNAL_API_BASE_URL: "https://trustsignal.example.com",
      TRUSTSIGNAL_API_KEY: "api-key",
      INTERNAL_API_KEY: "internal-key",
      INTERNAL_API_KEYS: "internal-key-2, internal-key-3",
      LOG_LEVEL: "info",
    });

    expect(env.GITHUB_PRIVATE_KEY_PEM).toContain("BEGIN RSA PRIVATE KEY");
    expect(env.GITHUB_API_BASE_URL).toBe("https://api.github.com");
    expect(env.INTERNAL_API_KEY).toBe("internal-key,internal-key-2,internal-key-3");
    expect(env.INTERNAL_API_KEYS).toEqual(["internal-key", "internal-key-2", "internal-key-3"]);
  });

  it("fails closed when required values are missing", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
      })
    ).toThrow();
  });

  it("accepts legacy GITHUB_PRIVATE_KEY for compatibility", () => {
    const env = parseEnv({
      NODE_ENV: "test",
      PORT: "3000",
      GITHUB_APP_ID: "123",
      GITHUB_APP_NAME: "TrustSignal",
      GITHUB_WEBHOOK_SECRET: "secret",
      GITHUB_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nkey\\n-----END RSA PRIVATE KEY-----",
      TRUSTSIGNAL_API_BASE_URL: "https://trustsignal.example.com",
      TRUSTSIGNAL_API_KEY: "api-key",
      INTERNAL_API_KEY: "internal-key",
      LOG_LEVEL: "info",
    });

    expect(env.GITHUB_PRIVATE_KEY_PEM).toContain("BEGIN RSA PRIVATE KEY");
  });

  it("accepts INTERNAL_API_KEYS when INTERNAL_API_KEY is not provided", () => {
    const env = parseEnv({
      NODE_ENV: "test",
      PORT: "3000",
      GITHUB_APP_ID: "123",
      GITHUB_APP_NAME: "TrustSignal",
      GITHUB_WEBHOOK_SECRET: "secret",
      GITHUB_PRIVATE_KEY_PEM: "-----BEGIN RSA PRIVATE KEY-----\\nkey\\n-----END RSA PRIVATE KEY-----",
      TRUSTSIGNAL_API_BASE_URL: "https://trustsignal.example.com",
      TRUSTSIGNAL_API_KEY: "api-key",
      INTERNAL_API_KEYS: "internal-key-a, internal-key-b",
      LOG_LEVEL: "info",
    });

    expect(env.INTERNAL_API_KEY).toBe("internal-key-a,internal-key-b");
    expect(env.INTERNAL_API_KEYS).toEqual(["internal-key-a", "internal-key-b"]);
  });
});
