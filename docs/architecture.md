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

### Runtime Inventory (Current Production)

| Domain | Vercel Project | Purpose | Runtime Separation Status |
| --- | --- | --- | --- |
| `trustsignal.dev` | `v0-signal-new` | marketing/docs site | isolated |
| `github.trustsignal.dev` | `trustsignal-github-app` | GitHub App backend | isolated |
| `api.trustsignal.dev` | `api` | verification API (served from separate repo/project) | isolated |

### Endpoint Contract Clarification

`TRUSTSIGNAL_API_BASE_URL` must target the API origin only and is currently normalized as:

- Primary path: `/api/v1/verifications/github`
- Compatibility path: `/v1/verifications/github` (used when the primary route is unavailable)

If the API is moved or renamed, update `TRUSTSIGNAL_API_BASE_URL` and keep only one canonical base URL.

### Environment Boundaries by Service

- GitHub App backend (`trustsignal-github-app`)
  - `GITHUB_*`, `TRUSTSIGNAL_API_BASE_URL`, `TRUSTSIGNAL_API_KEY`, `INTERNAL_API_KEY`
  - No marketing-site environment variables should be stored here
- API service (`api`)
  - API-only secrets and data-layer credentials
  - No GitHub App installation credentials
- Marketing/docs site (`v0-signal-new`)
  - Static and docs/runtime variables only

Keep each environment set to only the smallest required surface.

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
