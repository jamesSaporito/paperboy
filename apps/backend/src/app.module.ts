import { Module } from "@nestjs/common";
import { AiModule } from "./ai/ai.module";
import { EmailModule } from "./email/email.module";
import { EnvModule } from "./env";
import { GenerationsModule } from "./generations/generations.module";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { SubmissionsModule } from "./submissions/submissions.module";

@Module({
  imports: [EnvModule, PrismaModule, AiModule, SubmissionsModule, EmailModule, GenerationsModule],
  controllers: [HealthController],
})
export class AppModule {}
