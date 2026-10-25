import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { configureApp } from "./app";
import { AppModule } from "./app.module";
import { ENV, type Env } from "./env";

const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule));
await app.listen(app.get<Env>(ENV).PORT, "0.0.0.0");
