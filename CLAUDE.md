# CLAUDE.md

## Constraints

- `apps/backend` (NestJS 12, ESM) is bundled by tsdown, which also compiles the internal TS-source packages into `dist/`. Its `.oxlintrc.json` disables `consistent-type-imports` because Nest DI needs runtime class imports: never convert injected classes to `import type`.
- The Prisma schema lives in `packages/db/prisma/schema.prisma`; the generated client (`packages/db/src/generated/`) is gitignored and produced by the `db:generate` turbo task. After schema changes run `pnpm db:migrate` and commit the migration. Database names are snake_case: every model gets a plural `@@map("table_names")`, every multi-word field a `@map("column_name")`, and enums `@@map` plus lowercase `@map` values. Avoid SQL reserved words (`user`, `order`, …) as names.
- `@paperboy/ai` wraps the official `openai` SDK: `createAi()` for text (Responses API) and image generation, with `textUseCase`/`imageUseCase` for presets. Models are always configured by the caller, never hardcoded defaults. OpenAI calls cost money, so **tests never hit the real API**: they inject a fake `fetch` (`packages/ai/src/test/fake-openai.ts`), and the test setup blocks the network. Anything that uses `@paperboy/ai` elsewhere must be tested with a fake client too.
- The backend gets its `Ai` client from the `AI` provider (`apps/backend/src/ai/`), configured only through `OPENAI_*` env vars: the local llama.cpp container when `OPENAI_BASE_URL` is set, OpenAI when it's empty. Backend tests never reach a model: override `AI` with a fake via `createTestApp((builder) => builder.overrideProvider(AI).useValue(fake))`; `vitest.config.ts` points `OPENAI_BASE_URL` at a dead localhost port and `createTestApp()` refuses any non-`localhost` base URL. Keep both.
- Request bodies are validated by Zod schemas from `@paperboy/contracts` via `@Body({ schema })`.
- Backend tests boot the real app (`AppModule` + `configureApp()`) against the local database and go over HTTP.
- `pnpm dev:docker` must boot everything needed. Ordering is declared in `turbo.json`, not in scripts: packages own their tasks (e.g. `@paperboy/db` owns `db:up` → `db:deploy`) and dependents use `dependsOn`. Don't add `--filter` to scripts; root scripts are `turbo run <task>`, and Compose services run `turbo` from the app's folder (`working_dir`). `db:migrate` is the exception: it prompts, so it runs via `pnpm --dir` rather than Turbo.
- Submission images live in S3 (`apps/backend/src/storage/`), configured only through `S3_BUCKET`, `S3_ENDPOINT` and the AWS SDK's usual env vars: s3mock locally (Compose), AWS in production (bucket from Terraform), with no s3mock-specific code paths. Keys are generated (`submissions/<contactId>/<uuid>.<ext>`, `generations/<uuid>.<ext>`); never use a sender's filename in a key.
- `generations` has a hand-written check constraint (`generations_image_complete_check`, in its migration) that Prisma doesn't know about: keep the image columns all set or all null, and update the constraint if image columns change.
- Email (`apps/backend/src/email/`) is the main channel: the backend reads its mailbox over IMAP and sends over SMTP. It's configured only through `MAIL_*` env vars: a dedicated Gmail account in development and production, GreenMail in tests, with no GreenMail-specific code paths. Gmail's behavior that GreenMail lacks (`+` addresses, `Delivered-To`, `Authentication-Results`) is reproduced by `src/test/mail.ts` for tests. Never relax the accept rules (contact token + matching sender + `Authentication-Results`) to make local mail work.
- Verify behavior with tests, not scripts meant to be run by hand. `apps/backend/scripts/` is only for operational commands (e.g. `contact`), and their logic lives in tested modules under `src/`.
- Backend tests must never touch a real mailbox: `vitest.config.ts` forces every `MAIL_*` var to GreenMail (overriding `.env`, which holds real Gmail credentials) and S3 to s3mock's `paperboy-test` bucket, and `createTestApp()` throws if the mail hosts or S3 endpoint aren't `localhost`. Keep both.
- The dev container sets `DEV_CONTAINER=1`, which makes `db:up`, `s3:up` and `mail:up` no-ops there (Compose starts Postgres and s3mock; GreenMail only serves tests, which run on the host).
- Turbo runs in strict env mode: add any env var a task reads to `passThroughEnv`/`globalPassThroughEnv` (or `env`) in `turbo.json`, and to `.env.example`.

## Stack

pnpm workspaces + Turborepo, TypeScript 7 (strict), oxlint (type-aware via `oxlint-tsgolint`), Prettier. Node and pnpm are pinned in `.nvmrc` and `packageManager`; keep the Dockerfile's `NODE_VERSION` in sync. Node 25+ doesn't bundle Corepack, so the Dockerfile installs it (`COREPACK_VERSION`).

pnpm enforces a minimum release age; pin a slightly older version rather than adding `minimumReleaseAgeExclude`.

## Conventions

- Packages are named `@paperboy/<name>`, pin exact dependency versions, and depend on each other via `workspace:*`.
- Internal packages ship TypeScript source (no build step); the backend bundles them with tsdown.
- Every workspace exposes `lint` and `typecheck` scripts (and `build`/`dev` if applicable) so root `turbo` tasks pick them up.
- Run `pnpm lint && pnpm typecheck && pnpm build && pnpm test` before committing.

## Adding a workspace

1. Create `apps/<name>` or `packages/<name>` with a `package.json` named `@paperboy/<name>`.
2. Extend a preset: `tsconfig.json` from `@paperboy/config/tsconfig/*`, `.oxlintrc.json` from `packages/config/oxlint/*`.
3. Add `lint`/`typecheck` scripts. If it has its own `node_modules`, add a named volume for it in `docker-compose.yml` and pre-create the mount point in the `dev` stage of `docker/Dockerfile`.
