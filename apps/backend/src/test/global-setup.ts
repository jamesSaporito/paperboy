import { execFileSync } from "node:child_process";
import { createPrismaClient } from "@paperboy/db";

/**
 * Gives tests their own database, `paperboy_test`, on the local Postgres: created if missing, and
 * migrated before every run. Tests never touch the development database, whose data is real.
 */
export default async function setup(): Promise<void> {
  const testUrl = new URL(process.env.TEST_DATABASE_URL ?? "");
  // Created from the server's maintenance database; CREATE DATABASE can't use a placeholder.
  const serverUrl = new URL(testUrl);
  serverUrl.pathname = "/postgres";
  const server = createPrismaClient(serverUrl.href);
  try {
    const name = testUrl.pathname.slice(1);
    const existing = await server.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (existing.length === 0) await server.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await server.$disconnect();
  }

  execFileSync("pnpm", ["--dir", "../../packages/db", "exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testUrl.href },
    stdio: "pipe",
  });
}
