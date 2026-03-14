import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createHealthRouter } from "../src/routes/health";

describe("health routes", () => {
  it("returns readiness metadata including deployment fields", async () => {
    const originalGitSha = process.env.GIT_SHA;
    const originalBuildTime = process.env.BUILD_TIME;
    const originalBuildTs = process.env.BUILD_TIMESTAMP;

    process.env.GIT_SHA = "abc1234";
    process.env.BUILD_TIME = "2026-03-14T19:00:00Z";
    process.env.BUILD_TIMESTAMP = undefined;

    const app = express();
    app.use(createHealthRouter({
      NODE_ENV: "test",
      GITHUB_APP_NAME: "TrustSignal",
    }));

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.gitSha).toBe("abc1234");
    expect(response.body.buildTime).toBe("2026-03-14T19:00:00Z");
    expect(response.body.environment).toBe("test");
    expect(response.body.version).toBeDefined();

    process.env.GIT_SHA = originalGitSha;
    process.env.BUILD_TIME = originalBuildTime;
    process.env.BUILD_TIMESTAMP = originalBuildTs;
  });

  it("serves /version with deployment metadata", async () => {
    const app = express();
    app.use(createHealthRouter({ NODE_ENV: "production", GITHUB_APP_NAME: "TrustSignal" }));

    const response = await request(app).get("/version");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.version).toBeDefined();
    expect(response.body.environment).toBe("production");
  });
});
