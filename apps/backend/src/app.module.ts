import { Module } from "@nestjs/common";
import { EmailModule } from "./email/email.module";
import { EnvModule } from "./env";
import { GenerationsModule } from "./generations/generations.module";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { SubmissionsModule } from "./submissions/submissions.module";

@Module({
  imports: [EnvModule, PrismaModule, SubmissionsModule, EmailModule, GenerationsModule],
  controllers: [HealthController],
})
export class AppModule {}
