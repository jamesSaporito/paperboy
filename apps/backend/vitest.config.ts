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
    },
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
  },
});
