import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { configureApp } from "../app";
import { AppModule } from "../app.module";

export type TestApp = { app: NestExpressApplication; baseUrl: string };

/** Boots the real app on a random port, against the local database. Close it with `app.close()`. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
  await app.listen(0, "127.0.0.1");
  return { app, baseUrl: await app.getUrl() };
}
