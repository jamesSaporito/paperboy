# Paperboy

NestJS backend with PostgreSQL via Prisma, in a pnpm + Turborepo monorepo.

## Layout

```
apps/backend        NestJS API (bundled with tsdown)
apps/twilio-sim     Local Twilio + phone simulator (dev only)
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

One command starts everything: Postgres, a local mail server, the backend (after applying migrations) and the Twilio simulator, all with hot reload.

```sh
pnpm dev:docker       # backend :3100, Twilio simulator :3101, Postgres :5433, GreenMail SMTP :3025 / IMAP :3143
```

This wraps `docker compose up --build`. The `install` service runs `pnpm install` once before the app services start; after changing dependencies, rerun `pnpm dev:docker`. To reset container installs and data: `docker compose down -v`.

## Native

The backend runs on your machine; Postgres and GreenMail still run in Docker and are started automatically by any task that needs them.

```sh
pnpm install
pnpm dev          # backend :3100, Twilio simulator :3101
pnpm build        # backend bundle to apps/backend/dist
pnpm test         # backend tests against the local database and mail server, simulator tests
pnpm db:migrate   # create a migration after editing packages/db/prisma/schema.prisma
pnpm lint
pnpm typecheck
pnpm format
```

Task ordering lives in `turbo.json`: `@paperboy/db` owns `db:up` (start Postgres) and `db:deploy` (apply migrations), the backend owns `mail:up` (start GreenMail), and the backend's `dev` and `test` depend on them. Run `turbo` from inside a package folder to scope it to that package.

`GET /health` reports whether the backend can reach the database.

## Email

People send text and photos by emailing the app from their phone's mail app, and the app emails them back the same way. The backend reads its mailbox over IMAP (IDLE, so new mail is noticed within seconds) and sends over SMTP; there's no webhook or public endpoint.

Only known contacts get through. Each contact has a private address, the app's address plus `+<token>` (Gmail delivers these to the same inbox), and an email is accepted only if:

1. it was sent to an active contact's private address,
2. it's from that contact's own address, and
3. Gmail's `Authentication-Results` header says the sender's domain passed DMARC, DKIM or SPF, so a forged `From` doesn't count.

Accepted mail becomes a submission (the text, without quoted replies, and image attachments, checked by their contents) and is moved to the `Processed` folder; everything else goes to `Rejected`. Mail that fails to process stays in the inbox and is retried. Emails the app sends set Reply-To to the contact's private address, so replying just works.

```sh
pnpm --dir apps/backend contact add "Name" person@example.com   # prints their address; rerun to issue a new one
pnpm --dir apps/backend contact revoke person@example.com
pnpm --dir apps/backend contact list
```

**Locally**, GreenMail stands in for Gmail (`MAIL_*` in `.env`). It doesn't do `+` addresses or add Gmail's headers, so the tests (`apps/backend/src/email/*.test.ts`) deliver mail through `src/test/mail.ts`, which reproduces both.

**In production**, use a dedicated Gmail account (not a personal one):

1. Turn on 2-Step Verification, then create an app password (Google Account → Security → App passwords).
2. Set `MAIL_ADDRESS` to the account and `MAIL_PASSWORD` to the app password, and remove the `MAIL_*_HOST`, `_PORT` and `_SECURE` lines so Gmail's defaults apply.

A free account can send to about 500 recipients a day.

## Twilio simulator

`apps/twilio-sim` stands in for both Twilio and a person's phone, so messaging works locally without a Twilio account. Open http://localhost:3101 to text the app's number (`TWILIO_PHONE_NUMBER`), with photos.

- **Incoming messages:** each one is POSTed to `TWILIO_SIM_WEBHOOK_URL` exactly as Twilio would: form-encoded `From`, `To`, `Body`, `NumMedia`, `MediaUrl0`…, signed with `X-Twilio-Signature` using `TWILIO_AUTH_TOKEN`. The simulator serves the photos at those media URLs.
- **Replies:** a TwiML `<Message>` in the webhook response is delivered back to the phone, including `<Media>`.
- **Messages API:** `POST /2010-04-01/Accounts/{AccountSid}/Messages.json` (Basic auth with the account SID and auth token) sends to the phone, downloads any `MediaUrl`s, and reports `sending`, `sent`, `delivered` (or `failed`) to `StatusCallback`. `GET .../Messages/{Sid}.json` fetches a message.
- State is in memory: restarting the simulator clears the conversation.

It's not a full Twilio: no voice, Messaging Services, other TwiML verbs, or carrier behavior.
