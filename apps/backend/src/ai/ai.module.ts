import { Global, Module } from "@nestjs/common";
import { createAi, type Ai } from "@paperboy/ai";
import { ENV, type Env } from "../env";
import { AiHealthController } from "./ai-health.controller";
import { AI } from "./ai.token";

@Global()
@Module({
  providers: [
    {
      provide: AI,
      inject: [ENV],
      useFactory: (env: Env): Ai =>
        createAi({
          apiKey: env.OPENAI_API_KEY,
          baseURL: env.OPENAI_BASE_URL,
          textModel: env.OPENAI_TEXT_MODEL,
          imageModel: env.OPENAI_IMAGE_MODEL,
        }),
    },
  ],
  controllers: [AiHealthController],
  exports: [AI],
})
export class AiModule {}
