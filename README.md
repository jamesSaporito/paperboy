# Paperboy

NestJS backend with PostgreSQL via Prisma, in a pnpm + Turborepo monorepo.

## Layout

```
apps/backend        NestJS API (bundled with tsdown)
packages/ai         OpenAI text (Responses API) and image generation
packages/db         Prisma schema, migrations, and client
packages/contracts  Zod schemas and types shared by apps
packages/config     Shared tsconfig, oxlint, and Prettier presets
docker/             Dockerfile
```

## Prerequisites

- Node 26.12.1 (`nvm use`) with Corepack (`npm install -g corepack && corepack enable pnpm`), **or**
- Docker

## Setup

```sh
cp .env.example .env
```

## Docker (recommended)

One command starts everything: Postgres, s3mock (local S3), a local LLM (llama.cpp) and the backend (after applying migrations), with hot reload. Mail goes through the Gmail account in `.env`.

```sh
pnpm dev:docker       # backend :3100, Postgres :5433, s3mock :9091, llama.cpp :8081
```

This wraps `docker compose up --build`. The `install` service runs `pnpm install` once before the app services start; after changing dependencies, rerun `pnpm dev:docker`. To reset container installs and data: `docker compose down -v`.

## Native

The backend runs on your machine; Postgres, s3mock, llama.cpp (and GreenMail, for tests) still run in Docker and are started automatically by any task that needs them.

```sh
pnpm install
pnpm dev          # backend :3100
pnpm build        # backend bundle to apps/backend/dist
pnpm test         # backend tests against the local database, s3mock and GreenMail; AI tests (no network)
pnpm db:migrate   # create a migration after editing packages/db/prisma/schema.prisma
pnpm lint
pnpm typecheck
pnpm format
```

Task ordering lives in `turbo.json`: `@paperboy/db` owns `db:up` (start Postgres) and `db:deploy` (apply migrations), the backend owns `s3:up` (start s3mock) and `mail:up` (start GreenMail, the tests' mail server), and the backend's `dev` and `test` depend on what they need. Run `turbo` from inside a package folder to scope it to that package.

`GET /health` reports whether the backend can reach the database. `GET /ai-health` asks the configured model for a haiku (see [AI](#ai)).

## AI

`@paperboy/ai` talks to the OpenAI API, or to any OpenAI-compatible server. Which one is set by `OPENAI_BASE_URL` in `.env`:

- **Local model (default for development):** `OPENAI_BASE_URL=http://localhost:8081/v1` and `OPENAI_TEXT_MODEL=llama`; the API key can be anything. This is the `llama` container: llama.cpp serving `LLAMA_MODEL` from `LLAMA_MODELS_DIR` (by default the `models` folder next to this project), CPU only since Docker on macOS can't use the GPU. Free, but slower, and it can't generate images.
- **OpenAI:** leave `OPENAI_BASE_URL` empty and set a real `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL` and (for images) `OPENAI_IMAGE_MODEL`.

Inside Docker, Compose points the backend at the `llama` container by its in-network address whenever `OPENAI_BASE_URL` is set. `GET /ai-health` sends a three-word instruction and caps the output at 200 tokens: on OpenAI every call still costs money, so it shouldn't be exposed publicly as is. Tests never reach a model: they replace the `AI` provider with a fake, and the test config points `OPENAI_BASE_URL` at an address nothing listens on.

## Email

People send text and photos by emailing the app from their phone's mail app, and the app emails them back the same way. The backend reads its mailbox over IMAP (IDLE, so new mail is noticed within seconds) and sends over SMTP; there's no webhook or public endpoint.

Only known contacts get through. Each contact has a private address, the app's address plus `+<token>` (Gmail delivers these to the same inbox), and an email is accepted only if:

1. it was sent to an active contact's private address,
2. it's from that contact's own address, and
3. Gmail's `Authentication-Results` header says the sender's domain passed DMARC, DKIM or SPF, so a forged `From` doesn't count.

Accepted mail becomes a submission (the text, without quoted replies, and image attachments, checked by their contents; see [Submissions](#submissions)) and is moved to the `Processed` folder; everything else goes to `Rejected`. Mail that fails to process stays in the inbox and is retried. Emails the app sends set Reply-To to the contact's private address, so replying just works.

```sh
pnpm --dir apps/backend contact add "Name" person@example.com   # prints their address; rerun to issue a new one
pnpm --dir apps/backend contact revoke person@example.com
pnpm --dir apps/backend contact list
```

**Development and production** each use their own dedicated Gmail account (never a personal one, and never the same one: two backends on one inbox would compete for each message):

1. Turn on 2-Step Verification, then create an app password (Google Account → Security → App passwords).
2. Set `MAIL_ADDRESS` to the account and `MAIL_PASSWORD` to the app password in `.env`. Gmail's servers are the defaults.
3. Add yourself as a contact and email the address it prints. The app's `Processed` and `Rejected` folders show up as Gmail labels.

Run one backend at a time (Docker or native) against the development account.

**Tests** never touch Gmail: `vitest.config.ts` forces the local GreenMail server whatever `.env` says, and the test app refuses to boot against any other mail host. GreenMail doesn't do `+` addresses or add Gmail's headers, so the tests (`apps/backend/src/email/*.test.ts`) deliver mail through `src/test/mail.ts`, which reproduces both.

A free account can send to about 500 recipients a day.

## Submissions

Each accepted email is saved:

- **`submissions`:** one row per message with the sender (`contact_id` → `contacts`, which holds their name and email), the `text`, `created_at`, a `summary` (empty for now; filled in by AI later) and `email_message_id`, so a retried email isn't saved twice.
- **`submission_images`:** one row per photo, in order (`position`), with its `s3_key`, `content_type` and `size_bytes`.
- **The photos themselves** go to the `S3_BUCKET` bucket under `submissions/<contact id>/<uuid>.<ext>`. Keys are generated; the sender's filenames are never used.

Images are uploaded first and the rows written last, so a failure leaves no half-saved submission; the email stays in the inbox and is retried.

## Generations

AI output made from submissions is saved by `GenerationsService.save()` (nothing calls it yet):

- **`generations`:** the generated `text` with the `text_model`, `text_instructions`, `text_prompt` and token counts behind it, plus an optional generated image: `image_s3_key`, `image_content_type`, `image_size_bytes`, `image_model`, `image_prompt` and its token counts. A check constraint keeps the image columns all set or all empty.
- **`generation_submissions`:** which submissions each generation was made from. A submission can feed several generations, and can't be deleted while one uses it.
- **The image** goes to the same bucket under `generations/<uuid>.<ext>`, uploaded before the rows are written.

To browse submissions and generations, connect your database tool to `postgresql://paperboy:paperboy@localhost:5433/paperboy`.

**Locally**, S3 is s3mock (`adobe/s3mock`) on port 9091 with the `paperboy-submissions` bucket (and `paperboy-test` for tests); its files survive restarts in the `s3mock_data` volume. The app reaches it only through `S3_ENDPOINT`, so there's no s3mock-specific code.

**In production**, the bucket is created by Terraform. Set `S3_BUCKET` and `AWS_REGION`, and leave out `S3_ENDPOINT` and the access keys so the AWS SDK uses its role.
