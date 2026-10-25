import { StandardSchemaValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";

/** Shared by main.ts and tests. */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  // Validates @Body({ schema }) etc. with the Zod schemas from @paperboy/contracts.
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  return app;
}
