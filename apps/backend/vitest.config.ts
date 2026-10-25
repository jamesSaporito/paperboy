import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Tests run against the local database (Turbo starts and migrates it first). Existing env vars win.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  test: {
    // Tests always use the local GreenMail server, whatever .env says: development uses a real
    // Gmail account, which tests must never send from or empty. The mailbox is test-only too.
    env: {
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
    },
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
  },
});
