# Architecture Notes

## Service Boundaries

This repository ships two related but separate runtime units:

- GitHub App backend in `src/`
- GitHub Action runtime in `apps/action/`

The GitHub App backend is the deployable HTTP service. It handles:

- GitHub webhook ingress
- GitHub App and installation authentication
- event normalization
- TrustSignal verification orchestration
- GitHub check-run publishing

The GitHub Action runtime is not a hosted backend. GitHub executes it inside an Actions runner, and it only makes outbound requests to the TrustSignal verification API.

## Deployment Model

Preferred production split:

- `trustsignal.dev`: main website
- `api.trustsignal.dev`: public verification API
- `github.trustsignal.dev`: GitHub App backend / webhook receiver for this repository

This keeps the website, outbound verification API, and inbound webhook receiver operationally independent.

## Security Model

- Fail closed when required GitHub App or webhook secrets are missing.
- Verify `X-Hub-Signature-256` against the raw request body.
- Use constant-time signature comparison.
- Cache installation tokens in memory only.
- Never persist installation tokens.
- Redact authentication material from logs.
- Use internal API-key protection for operational routes.
- Keep permissions least-privilege.

## Multi-Tenant Design

Installation context is always derived from the webhook payload. The service never assumes a single repo, org, or installation.

## Queue Readiness

Webhook processing is synchronous in this MVP, but normalization and verification orchestration are separated so an async queue can be introduced later without changing route contracts.
