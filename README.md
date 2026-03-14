# TrustSignal GitHub App

TrustSignal GitHub App is a minimal production-ready backend for GitHub App webhook intake, TrustSignal verification orchestration, and GitHub check-run publishing. The repository also includes a GitHub Action runtime that submits the same verification contract to the TrustSignal API.

It is designed for the first enterprise-safe deployment of TrustSignal as a GitHub App:

- GitHub App authentication only
- no personal access tokens
- least-privilege repository permissions
- signed webhook verification
- in-memory installation token caching with safe expiry handling
- check-run publishing for verification results
- multi-tenant installation awareness from webhook context

## What The App Does

1. Receives GitHub webhook events for repositories where the app is installed.
2. Verifies `X-Hub-Signature-256` using the raw request body.
3. Derives repository and event context for verification.
4. Calls a TrustSignal verification adapter.
5. Publishes verification results back to GitHub as check runs.

## MVP Event Support

- `workflow_run`
- `release`
- `push`
- `check_suite`
- `check_run`

Initial behavior is intentionally narrow:

- `workflow_run`: handles completed runs and publishes TrustSignal verification checks
- `release`: handles published releases and prepares release verification context
- `push`: creates verification context for default-branch pushes only
- `check_suite` and `check_run`: reserved for future correlation, currently handled safely and minimally

## Architecture Overview

This repository contains two distinct runtime surfaces:

- GitHub App backend: the public webhook receiver and operational API in `src/`
- GitHub Action runtime: the bundled action in `apps/action/` that runs inside GitHub-hosted runners

They are not deployed the same way:

- The GitHub Action is committed code executed by GitHub Actions runners and only needs outbound access to the TrustSignal verification API.
- The GitHub App backend is a separately deployed HTTP service that must expose a public webhook URL.

Core modules:

- `src/config/env.ts`: environment validation
- `src/github/auth.ts`: app JWT and installation token handling
- `src/github/client.ts`: GitHub API client methods
- `src/webhooks/verifySignature.ts`: HMAC signature verification
- `src/webhooks/parseEvent.ts`: event metadata extraction
- `src/webhooks/handlers/`: event normalization logic
- `src/webhooks/github.ts`: webhook orchestration
- `src/checks/publishCheckRun.ts`: GitHub check-run payload mapping and publishing
- `src/trustsignal/`: shared TrustSignal verification contract, GitHub payload normalization, and API client
- `src/verification/verifyArtifact.ts`: app-side TrustSignal verification service using the shared client
- `src/routes/health.ts`: readiness endpoint
- `src/routes/github.ts`: internal operational routes
- `src/server.ts`: Express server bootstrap and middleware
- `apps/action/src/`: GitHub Action runtime, env parsing, and output handling

Additional architecture notes are in [docs/architecture.md](docs/architecture.md).

## GitHub App Authentication Model

The service uses GitHub App authentication only:

1. Generate an app JWT signed with the GitHub App private key.
2. Exchange the JWT for an installation access token for the installation in the webhook payload.
3. Use the installation token for repository-scoped API calls.

Security properties:

- installation tokens are cached in memory only
- installation tokens are never written to disk or a database
- private key material is loaded from environment secrets
- the service fails closed if required GitHub App secrets are missing

## Required Repository Permissions

Configure the GitHub App with the minimum permissions needed for this MVP:

- Metadata: Read-only
- Contents: Read-only
- Actions: Read-only
- Checks: Read & write

Do not request contents write, administration, or personal token access.

## Required Webhook Events

Subscribe only to the events needed for this MVP:

- `workflow_run`
- `release`
- `push`
- `check_suite`
- `check_run`

## Required Environment Variables

See [.env.example](.env.example).

Required values:

- `NODE_ENV`
- `PORT`
- `GITHUB_APP_ID`
- `GITHUB_APP_NAME`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_PRIVATE_KEY_PEM`
- `GITHUB_API_BASE_URL`
- `GITHUB_GRAPHQL_BASE_URL`
- `GITHUB_WEB_BASE_URL`
- `TRUSTSIGNAL_API_BASE_URL`
- `TRUSTSIGNAL_API_KEY`
- `INTERNAL_API_KEY`
- `LOG_LEVEL`

Important distinction:

- `TRUSTSIGNAL_API_BASE_URL` is the outbound verification API this service calls, for example `https://api.trustsignal.dev`.
  - Primary route expected by this service: `${TRUSTSIGNAL_API_BASE_URL}/api/v1/verifications/github`
  - Compatibility route (if needed): `${TRUSTSIGNAL_API_BASE_URL}/v1/verifications/github`

  The API base URL is distinct from the webhook host:
  - App callback/base webhook host: `https://github.trustsignal.dev`
  - Verification API host: `https://api.trustsignal.dev`
- The GitHub App webhook host is the public host that receives inbound webhooks, for example `https://github.trustsignal.dev/webhooks/github`.

Do not assume those are the same service unless your deployment explicitly serves both route sets.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Export the environment variables before starting the server:

```bash
set -a
source .env.example
set +a
```

3. Start the service:

```bash
npm run dev
```

4. Run the test and build checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## GitHub Actions

The repository includes two baseline GitHub Actions workflows:

- `CI`: runs `npm run validate` on pull requests and pushes to `main` across Node.js 20 and 22
- `Action Bundle Check`: rebuilds `apps/action/dist/index.js` and fails if the committed bundle is out of date
- `Dependency Review`: blocks pull requests that introduce moderate-or-higher vulnerable dependencies
- `CodeQL`: scans the TypeScript codebase on pull requests, pushes to `main`, and a weekly schedule
- `Scorecards`: runs supply-chain posture checks on `main` and on a weekly schedule

This repository keeps merge gates intentionally lean so a solo founder can move quickly without dropping basic safety checks.

## GitHub Action Runtime

The GitHub Action entry point lives in `apps/action/src/main.ts`. It reads GitHub Actions environment variables and the event payload from `GITHUB_EVENT_PATH`, normalizes that payload into the same TrustSignal verification request used by the GitHub App, and submits it with the same API client.

Published action metadata lives in `apps/action/action.yml`, and the release artifact GitHub executes is the bundled file `apps/action/dist/index.js`. Build the repository before tagging so that file is updated and committed with the release.

### Action Inputs

- `trustsignal-api-base-url`: required TrustSignal API base URL
- `trustsignal-api-key`: required API key for the TrustSignal verification API

### Action Outputs

- `receipt_id`: verification receipt identifier, when returned
- `verification_status`: TrustSignal verification lifecycle status

### Action Usage

```yaml
steps:
  - uses: owner/repo/apps/action@v0.1.0
    id: trustsignal
    with:
      trustsignal-api-base-url: ${{ secrets.TRUSTSIGNAL_API_BASE_URL }}
      trustsignal-api-key: ${{ secrets.TRUSTSIGNAL_API_KEY }}

  - run: echo "Receipt ${{ steps.trustsignal.outputs.receipt_id }}"
```

The GitHub Action does not require this repository's webhook backend to be deployed. It only needs a reachable TrustSignal verification API.

## Local Webhook Testing

Use a local tunnel such as ngrok or Cloudflare Tunnel and set the GitHub App webhook URL to your tunneled endpoint:

```text
https://<your-tunnel-host>/webhooks/github
```

## Internal Operational Endpoints

- `GET /`
- `GET /health`
- `POST /webhooks/github`
- `GET /github/installations`
- `POST /github/check-run`

`/github/installations` and `/github/check-run` are internal endpoints and require the dedicated internal API key via `Authorization: Bearer <INTERNAL_API_KEY>` or `x-api-key`.

`GET /` returns a minimal service descriptor for load balancers, demos, and quick smoke checks. `GET /health` returns environment, uptime, timestamp, and deployment metadata (`gitSha`, `buildTime`, `version`) suitable for readiness checks.

- `GET /version` is a compact deployment verification endpoint with the same metadata.

## Registering The GitHub App

Create the app in GitHub settings with these manual values:

- App name: `TrustSignal`
- Description: `Integrity verification for CI artifacts and releases`
- Homepage URL: your TrustSignal site or repository URL
- Webhook URL: `https://<your-github-app-host>/webhooks/github`
- Webhook secret: generate and store as `GITHUB_WEBHOOK_SECRET`

Recommended production split:

- `trustsignal.dev`: website / marketing app
- `api.trustsignal.dev`: public TrustSignal verification API used by the GitHub Action and other clients
- `github.trustsignal.dev`: GitHub App backend from this repository

This separation avoids breaking the website or verification API when you redeploy the webhook receiver.

Permissions:

- Metadata: Read-only
- Contents: Read-only
- Actions: Read-only
- Checks: Read & write

Events:

- `workflow_run`
- `release`
- `push`
- `check_suite`
- `check_run`

## GitHub Cloud And GHES

The service is GitHub Cloud first and GHES aware:

- GitHub Cloud defaults:
  - API: `https://api.github.com`
  - GraphQL: `https://api.github.com/graphql`
  - Web: `https://github.com`
- GHES example:
  - API: `https://ghe.example.com/api/v3`
  - GraphQL: `https://ghe.example.com/api/v3/graphql`
  - Web: `https://ghe.example.com`

When GitHub includes `x-github-enterprise-version`, TrustSignal records that value in verification provenance and structured logs. See [docs/integrations/github.md](docs/integrations/github.md) for setup and compatibility notes.

## Operational Notes

- verify webhook signatures before JSON parsing
- never log secrets or full webhook payloads by default
- use only installation-derived context for multi-tenant safety
- delivery deduplication blocks concurrent duplicates but allows GitHub retries after failed processing
- reuse the same GitHub check run for the accepted and completed states
- return success only after the event has been safely accepted or processed
- the app and the action both use the same shared TrustSignal verification contract and client
