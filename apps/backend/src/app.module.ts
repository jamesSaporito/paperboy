import { Module } from "@nestjs/common";
import { EmailModule } from "./email/email.module";
import { EnvModule } from "./env";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { SubmissionsModule } from "./submissions/submissions.module";
import { TwilioModule } from "./twilio/twilio.module";

@Module({
  imports: [EnvModule, PrismaModule, SubmissionsModule, TwilioModule, EmailModule],
  controllers: [HealthController],
})
export class AppModule {}
