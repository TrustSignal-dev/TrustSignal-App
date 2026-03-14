import { readFileSync } from "node:fs";
import { z } from "zod";

const actionEnvSchema = z.object({
  GITHUB_EVENT_NAME: z.enum(["workflow_run", "release", "push"]),
  GITHUB_EVENT_PATH: z.string().min(1),
  TRUSTSIGNAL_API_BASE_URL: z.string().url(),
  TRUSTSIGNAL_API_KEY: z.string().min(1),
  GITHUB_OUTPUT: z.string().optional(),
});

export type ActionEnv = z.infer<typeof actionEnvSchema>;

export function parseActionEnv(input: NodeJS.ProcessEnv): ActionEnv {
  return actionEnvSchema.parse({
    ...input,
    TRUSTSIGNAL_API_BASE_URL: input.INPUT_TRUSTSIGNAL_API_BASE_URL || input.TRUSTSIGNAL_API_BASE_URL,
    TRUSTSIGNAL_API_KEY: input.INPUT_TRUSTSIGNAL_API_KEY || input.TRUSTSIGNAL_API_KEY,
  });
}

export function readGitHubEventPayload(eventPath: string) {
  return JSON.parse(readFileSync(eventPath, "utf8")) as Record<string, any>;
}
