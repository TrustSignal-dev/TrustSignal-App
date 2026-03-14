import crypto from "node:crypto";

export function computeGitHubSignature(secret: string, rawBody: Buffer) {
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${digest}`;
}

export function verifyGitHubWebhookSignature(secret: string, rawBody: Buffer, signature: string | undefined) {
  if (!signature) {
    return false;
  }

  const expected = computeGitHubSignature(secret, rawBody);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
