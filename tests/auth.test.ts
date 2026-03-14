import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { GitHubAppAuth } from "../src/github/auth";

describe("GitHubAppAuth", () => {
  it("creates a signed app JWT", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const auth = new GitHubAppAuth({
      GITHUB_APP_ID: "12345",
      GITHUB_PRIVATE_KEY_PEM: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
    });

    const issuedAt = Math.floor(Date.now() / 1000);
    const token = auth.createAppJwt(issuedAt);
    const decoded = jwt.verify(token, publicKey.export({ type: "pkcs1", format: "pem" }).toString(), {
      algorithms: ["RS256"],
      clockTimestamp: issuedAt,
    }) as jwt.JwtPayload;

    expect(decoded.iss).toBe("12345");
  });

  it("caches installation tokens in memory", async () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const auth = new GitHubAppAuth({
      GITHUB_APP_ID: "12345",
      GITHUB_PRIVATE_KEY_PEM: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
    });
    const requestToken = vi.fn().mockResolvedValue({ token: "installation-token", expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });

    const first = await auth.getInstallationToken(1, requestToken);
    const second = await auth.getInstallationToken(1, requestToken);

    expect(first).toBe("installation-token");
    expect(second).toBe("installation-token");
    expect(requestToken).toHaveBeenCalledTimes(1);
  });

  it("refreshes installation tokens close to expiry", async () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const auth = new GitHubAppAuth({
      GITHUB_APP_ID: "12345",
      GITHUB_PRIVATE_KEY_PEM: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
    });
    const requestToken = vi
      .fn()
      .mockResolvedValueOnce({ token: "stale-token", expiresAt: new Date(Date.now() + 30_000).toISOString() })
      .mockResolvedValueOnce({ token: "fresh-token", expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });

    const first = await auth.getInstallationToken(1, requestToken);
    const second = await auth.getInstallationToken(1, requestToken);

    expect(first).toBe("stale-token");
    expect(second).toBe("fresh-token");
    expect(requestToken).toHaveBeenCalledTimes(2);
  });
});
