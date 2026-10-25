import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AiModule } from "./ai/ai.module";
import { EmailModule } from "./email/email.module";
import { EnvModule } from "./env";
import { FrontPageModule } from "./front-page/front-page.module";
import { GenerationsModule } from "./generations/generations.module";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { SubmissionsModule } from "./submissions/submissions.module";

@Module({
  imports: [
    EnvModule,
    PrismaModule,
    AiModule,
    SubmissionsModule,
    EmailModule,
    GenerationsModule,
    ScheduleModule.forRoot(),
    FrontPageModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
