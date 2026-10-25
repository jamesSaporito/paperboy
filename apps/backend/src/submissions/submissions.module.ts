import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { SubmissionsService } from "./submissions.service";

@Module({
  imports: [StorageModule],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
