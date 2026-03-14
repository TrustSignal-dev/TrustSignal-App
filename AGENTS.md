# Repository Guidelines

## Project Structure & Module Organization
TrustSignal is a TypeScript backend for GitHub App webhook intake and verification orchestration. Core code lives in `src/`: `src/server.ts` boots Express, `src/routes/` defines HTTP endpoints, `src/webhooks/` handles signature verification and event parsing, `src/github/` wraps GitHub auth/API calls, `src/checks/` publishes check runs, and `src/verification/` contains the TrustSignal adapter. Shared utilities are in `src/lib/`, and types live in `src/types/`. Tests are in `tests/`. Build output goes to `dist/`. See `docs/architecture.md` for the higher-level flow.

## Build, Test, and Development Commands
Use Node.js 20+ as declared in `package.json`.

- `npm run dev` runs the service locally with `tsx watch src/server.ts`.
- `npm run build` compiles TypeScript into `dist/`.
- `npm run start` starts the compiled server from `dist/server.js`.
- `npm run lint` runs ESLint across the repo.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run test` runs the Vitest suite.
- `npm run validate` runs lint, typecheck, test, and build in sequence.

## Coding Style & Naming Conventions
Write explicit, strict TypeScript and keep modules focused. Follow the existing style: double quotes, semicolons, and small composable functions. Use `camelCase` for variables/functions, `PascalCase` for types/interfaces when needed, and descriptive file names such as `verifySignature.ts` or `publishCheckRun.ts`. Respect the current ESLint rules in `eslint.config.mjs`, including unused-variable exceptions only for `_prefixed` arguments.

## Testing Guidelines
Vitest is the test runner; tests are discovered with `tests/**/*.test.ts`. Place new tests in `tests/` and name them after the behavior under test, for example `webhookAuth.test.ts`. Cover critical paths: env validation, auth, signature verification, payload normalization, and route behavior. Run `npm run test` before opening a PR, and use `npm run validate` for full pre-merge checks.

## Commit & Pull Request Guidelines
This repository currently has no commit history, so there is no established commit-message convention yet. Use short, imperative messages such as `Add replay protection to webhook handler`. Keep commits focused. PRs should include a concise description, risk notes for security-sensitive changes, linked issues when available, updated docs or `.env.example` for config changes, and sample request/response output when API behavior changes.

## Security & Configuration Tips
Never commit real secrets. Copy `.env.example` to `.env` for local work, and keep all credentials in environment variables. Do not log webhook payloads, private keys, or API keys. Validate inputs at route boundaries and fail closed on missing security configuration.
