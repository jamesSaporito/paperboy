import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { configureApp } from "../app";
import { AppModule } from "../app.module";
import { ENV, type Env } from "../env";

export type TestApp = { app: NestExpressApplication; baseUrl: string };

/** Boots the real app on a random port, against the local database. Close it with `app.close()`. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  // A second line of defense behind vitest.config.ts: never boot against a real mailbox.
  const env = moduleRef.get<Env>(ENV);
  for (const host of [env.MAIL_IMAP_HOST, env.MAIL_SMTP_HOST]) {
    if (host !== "localhost") throw new Error(`Tests must use the local mail server, not ${host}`);
  }
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
  await app.listen(0, "127.0.0.1");
  return { app, baseUrl: await app.getUrl() };
}
