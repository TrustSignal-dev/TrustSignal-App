# GitHub Integration

## Scope

This service implements the TrustSignal GitHub App MVP for:

- `push`
- `release`
- `workflow_run`

The integration is webhook driven. It validates `X-Hub-Signature-256` against the raw body before JSON parsing, derives tenant context from the webhook payload, submits verification context to TrustSignal, and writes native GitHub Check Runs back to the repository.

## Required GitHub App Permissions

- Metadata: read
- Contents: read
- Actions: read
- Checks: write

Do not grant broader permissions for the pilot.

## Required Webhook Events

- `push`
- `release`
- `workflow_run`

## Environment Configuration

GitHub Cloud defaults:

- `GITHUB_API_BASE_URL=https://api.github.com`
- `GITHUB_GRAPHQL_BASE_URL=https://api.github.com/graphql`
- `GITHUB_WEB_BASE_URL=https://github.com`

GHES example:

- `GITHUB_API_BASE_URL=https://ghe.example.com/api/v3`
- `GITHUB_GRAPHQL_BASE_URL=https://ghe.example.com/api/v3/graphql`
- `GITHUB_WEB_BASE_URL=https://ghe.example.com`

Required secrets:

- `GITHUB_APP_ID`
- `GITHUB_PRIVATE_KEY_PEM`
- `GITHUB_WEBHOOK_SECRET`

## Event Handling

`push`

- Accepts signed push events.
- Ignores non-default-branch pushes.
- Creates a TrustSignal Check Run tied to the pushed commit SHA.

`workflow_run`

- Handles completed workflow runs.
- Refreshes workflow metadata from GitHub using the installation token.
- Publishes the resulting TrustSignal Check Run on the workflow run `head_sha`.

`release`

- Handles published releases.
- Refreshes release metadata from GitHub.
- Resolves `target_commitish` to a commit SHA when GitHub provides a branch or tag name.
- Publishes the resulting TrustSignal Check Run on the resolved target commit.

## Internal Routes

- `GET /github/installations`
- `POST /github/check-run`

These routes are protected with the TrustSignal internal API key and are not intended for public exposure.

## Example Workflow

```yaml
name: trustsignal-artifact

on:
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build artifact
        run: tar -czf artifact.tgz README.md
      - name: Compute digest
        id: digest
        run: echo "sha256=$(sha256sum artifact.tgz | awk '{print $1}')" >> "$GITHUB_OUTPUT"
      - name: Submit to TrustSignal
        env:
          TRUSTSIGNAL_API_BASE_URL: ${{ secrets.TRUSTSIGNAL_API_BASE_URL }}
          TRUSTSIGNAL_API_KEY: ${{ secrets.TRUSTSIGNAL_API_KEY }}
        run: |
          curl -fsSL \
            -H "Authorization: Bearer ${TRUSTSIGNAL_API_KEY}" \
            -H "Content-Type: application/json" \
            -d '{
              "repository": "'"${GITHUB_REPOSITORY}"'",
              "runId": "'"${GITHUB_RUN_ID}"'",
              "sha": "'"${GITHUB_SHA}"'",
              "artifactDigest": "'"${{ steps.digest.outputs.sha256 }}"'"
            }' \
            "${TRUSTSIGNAL_API_BASE_URL}/v1/verifications/github"
```

## Compatibility Notes

- The service does not persist installation tokens.
- Delivery deduplication is in-memory for the MVP; deploy a shared dedupe store before scaling horizontally.
- GraphQL base URL is configurable for future feature work, but the current MVP uses REST endpoints only.
- GHES support assumes REST endpoints compatible with the app installation, checks, releases, and actions APIs used here.
