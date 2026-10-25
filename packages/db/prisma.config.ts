import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// The Prisma CLI doesn't load .env files; use the repo root's. Existing env vars win.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Optional so `prisma generate` works without a database (CI, Docker builds).
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
