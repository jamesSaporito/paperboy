import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { GenerationsService } from "./generations.service";

@Module({
  imports: [StorageModule],
  providers: [GenerationsService],
  exports: [GenerationsService],
})
export class GenerationsModule {}
