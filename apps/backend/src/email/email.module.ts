import { Module } from "@nestjs/common";
import { SubmissionsModule } from "../submissions/submissions.module";
import { InboxService } from "./inbox.service";
import { MailService } from "./mail.service";

@Module({
  imports: [SubmissionsModule],
  providers: [InboxService, MailService],
  exports: [MailService],
})
export class EmailModule {}
