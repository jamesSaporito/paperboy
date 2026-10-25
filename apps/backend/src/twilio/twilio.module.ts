import { Module } from "@nestjs/common";
import { SubmissionsModule } from "../submissions/submissions.module";
import { TwilioMediaService } from "./twilio-media.service";
import { TwilioSignatureGuard } from "./twilio-signature.guard";
import { TwilioController } from "./twilio.controller";

@Module({
  imports: [SubmissionsModule],
  controllers: [TwilioController],
  providers: [TwilioMediaService, TwilioSignatureGuard],
})
export class TwilioModule {}
