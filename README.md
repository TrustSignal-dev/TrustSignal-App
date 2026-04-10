# TrustSignal GitHub App



[![CI](https://img.shields.io/github/actions/workflow/status/TrustSignal-dev/TrustSignal-App/ci.yml?label=CI)](https://github.com/TrustSignal-dev/TrustSignal-App/actions/workflows/ci.yml)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)



Production-ready GitHub App backend for webhook intake, TrustSignal verification orchestration, and check-run publishing. Also includes a GitHub Action runtime that submits the same verification contract to the TrustSignal API.



---



## What It Does



1. Receives GitHub webhook events for installed repositories

2. Verifies `X-Hub-Signature-256` using the raw request body

3. Derives repository and event context for verification

4. Calls the TrustSignal verification API

5. Publishes verification results back to GitHub as check runs



### Supported Events



| Event | Behavior |

|---|---|

| `workflow_run` | Publishes TrustSignal verification checks on completion |

| `release` | Prepares release verification context on publish |

| `push` | Creates verification context for default-branch pushes |

| `check_suite` | Reserved for future correlation |

| `check_run` | Reserved for future correlation |



---



## Architecture



Two distinct runtime surfaces in one repository:



| Surface | Location | Deployment |

|---|---|---|

| **GitHub App backend** | `src/` | Separately deployed HTTP service with public webhook URL |

| **GitHub Action runtime** | `apps/action/` | Committed code executed by GitHub Actions runners |



The Action only needs outbound access to the TrustSignal API. The App backend must expose a public webhook endpoint.



### Core Modules



```

src/

├── config/env.ts                 Environment validation

├── github/auth.ts                App JWT + installation token handling

├── github/client.ts              GitHub API client

├── webhooks/

│   ├── verifySignature.ts        HMAC signature verification

│   ├── parseEvent.ts             Event metadata extraction

│   ├── handlers/                 Event normalization (push, release, workflow_run, etc.)

│   └── github.ts                 Webhook orchestration

├── checks/publishCheckRun.ts     Check-run payload mapping + publishing

├── trustsignal/                  Shared verification contract, API client

├── verification/verifyArtifact.ts  App-side verification service

├── routes/health.ts              Readiness endpoint

├── routes/github.ts              Internal operational routes

└── server.ts                     Express server bootstrap

apps/action/src/                  GitHub Action entry point, env parsing, outputs

```



---



## Authentication Model



GitHub App authentication only — no personal access tokens:



1. Generate an app JWT signed with the GitHub App private key

2. Exchange for an installation access token scoped to the webhook payload

3. Use installation token for repository-scoped API calls



Security properties:

- Installation tokens cached in memory only, never written to disk

- Private key material loaded from environment secrets

- Fails closed if required secrets are missing



### Required Permissions



| Permission | Access |

|---|---|

| Metadata | Read-only |

| Contents | Read-only |

| Actions | Read-only |

| Checks | Read & write |



---



## Quick Start



### Environment



See [.env.example](.env.example). Required variables:



| Variable | Purpose |

|---|---|

| `GITHUB_APP_ID` | GitHub App identifier |

| `GITHUB_WEBHOOK_SECRET` | Webhook HMAC secret |

| `GITHUB_PRIVATE_KEY_PEM` | App private key |

| `TRUSTSIGNAL_API_BASE_URL` | TrustSignal verification API (e.g., `https://api.trustsignal.dev`) |

| `TRUSTSIGNAL_API_KEY` | API key for verification requests |

| `INTERNAL_API_KEY` | Key for internal operational endpoints |



### Development



```bash

npm install

cp .env.example .env

npm run dev

```



### Validation



```bash

npm run lint

npm run typecheck

npm run test

npm run build

```



---



## Endpoints



| Method | Path | Access |

|---|---|---|

| `GET /` | Service descriptor | Public |

| `GET /health` | Readiness check (env, uptime, deploy metadata) | Public |

| `GET /version` | Compact deployment verification | Public |

| `POST /webhooks/github` | Webhook receiver | GitHub (signature-verified) |

| `GET /github/installations` | List installations | Internal (`Authorization: Bearer`) |

| `POST /github/check-run` | Manual check-run publish | Internal |



---



## GitHub Action



The bundled Action submits the same verification contract used by the App backend.



### Usage



```yaml

steps:

  - uses: TrustSignal-dev/TrustSignal-App/apps/action@v0.1.0

    id: trustsignal

    with:

      trustsignal-api-base-url: ${{ secrets.TRUSTSIGNAL_API_BASE_URL }}

      trustsignal-api-key: ${{ secrets.TRUSTSIGNAL_API_KEY }}



  - run: echo "Receipt ${{ steps.trustsignal.outputs.receipt_id }}"

```



**Outputs:** `receipt_id`, `verification_status`



The Action does not require the webhook backend to be deployed — it only needs a reachable TrustSignal verification API.



---



## Recommended Production Domains



| Domain | Purpose |

|---|---|

| `trustsignal.dev` | Website / marketing |

| `api.trustsignal.dev` | Public verification API |

| `github.trustsignal.dev` | GitHub App webhook backend |



---



## CI Workflows



- **CI** — Runs `npm run validate` on PRs and pushes to `main` (Node.js 20 + 22)

- **Action Bundle Check** — Verifies committed bundle matches source

- **Dependency Review** — Blocks PRs with moderate+ vulnerable dependencies

- **CodeQL** — TypeScript security analysis

- **Scorecards** — Supply-chain posture checks



---



## Related Repositories



| Repository | Purpose |

|---|---|

| [TrustSignal](https://github.com/TrustSignal-dev/TrustSignal) | Core API and verification engine |

| [TrustSignal-Verify-Artifact](https://github.com/TrustSignal-dev/TrustSignal-Verify-Artifact) | Standalone GitHub Action for artifact verification |

| [v0-signal-new](https://github.com/TrustSignal-dev/v0-signal-new) | Public website — trustsignal.dev |

