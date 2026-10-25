import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Tests run against the local database (Turbo starts and migrates it first). Existing env vars win.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  test: {
    // Its own mailbox on the mail server, so a running dev backend doesn't consume test mail.
    env: { MAIL_ADDRESS: "paperboy-test@localhost" },
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
  },
});
