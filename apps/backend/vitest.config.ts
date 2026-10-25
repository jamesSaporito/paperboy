import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Tests run against the local Postgres (Turbo starts it first). Existing env vars win.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// …but in their own database, never the development one: src/test/global-setup.ts creates and
// migrates it. Only ever on a local server.
const testDatabaseUrl = new URL(process.env.DATABASE_URL ?? "postgresql://localhost:5433/paperboy");
if (testDatabaseUrl.hostname !== "localhost") {
  throw new Error(`Tests only run against a local Postgres, not ${testDatabaseUrl.hostname}`);
}
testDatabaseUrl.pathname = "/paperboy_test";
process.env.TEST_DATABASE_URL = testDatabaseUrl.href;

export default defineConfig({
  test: {
    // Tests always use the local GreenMail server, whatever .env says: development uses a real
    // Gmail account, which tests must never send from or empty. The mailbox is test-only too.
    globalSetup: ["./src/test/global-setup.ts"],
    env: {
      DATABASE_URL: testDatabaseUrl.href,
      MAIL_ADDRESS: "paperboy-test@localhost",
      MAIL_PASSWORD: "test",
      MAIL_IMAP_HOST: "localhost",
      MAIL_IMAP_PORT: "3143",
      MAIL_IMAP_SECURE: "false",
      MAIL_SMTP_HOST: "localhost",
      MAIL_SMTP_PORT: "3025",
      MAIL_SMTP_SECURE: "false",
      // Likewise s3mock, with a bucket of its own, never a real one.
      S3_ENDPOINT: "http://localhost:9091",
      S3_BUCKET: "paperboy-test",
      AWS_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
      // And never a real model (which costs money): an address nothing listens on, so anything not
      // replaced with a fake fails at once. Tests that use AI override the AI provider.
      OPENAI_BASE_URL: "http://localhost:9/v1",
      OPENAI_API_KEY: "test",
      OPENAI_TEXT_MODEL: "test-model",
      OPENAI_IMAGE_MODEL: "",
      JOBS_TOKEN: "test-jobs-token-that-is-at-least-32-characters",
    },
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
  },
});
