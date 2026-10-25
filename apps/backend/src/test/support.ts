import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { configureApp } from "../app";
import { AppModule } from "../app.module";
import { ENV, type Env } from "../env";

export type TestApp = { app: NestExpressApplication; baseUrl: string };

/**
 * Boots the real app on a random port, against the local database. Close it with `app.close()`.
 * `configure` can replace providers, e.g. `(builder) => builder.overrideProvider(AI).useValue(fake)`.
 */
export async function createTestApp(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<TestApp> {
  const moduleRef = await configure(Test.createTestingModule({ imports: [AppModule] })).compile();
  // A second line of defense behind vitest.config.ts: never boot against a real mailbox, bucket or
  // model.
  const env = moduleRef.get<Env>(ENV);
  for (const host of [env.MAIL_IMAP_HOST, env.MAIL_SMTP_HOST]) {
    if (host !== "localhost") throw new Error(`Tests must use the local mail server, not ${host}`);
  }
  if (!env.S3_ENDPOINT || new URL(env.S3_ENDPOINT).hostname !== "localhost") {
    throw new Error(`Tests must use the local S3 (s3mock), not ${env.S3_ENDPOINT ?? "AWS"}`);
  }
  if (!new URL(env.DATABASE_URL).pathname.endsWith("_test")) {
    throw new Error("Tests must use the test database, not the development one");
  }
  if (!env.OPENAI_BASE_URL || new URL(env.OPENAI_BASE_URL).hostname !== "localhost") {
    throw new Error(`Tests must never reach a real model, not ${env.OPENAI_BASE_URL ?? "OpenAI"}`);
  }
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
  await app.listen(0, "127.0.0.1");
  return { app, baseUrl: await app.getUrl() };
}
