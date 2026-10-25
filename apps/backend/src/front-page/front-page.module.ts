import { Module } from "@nestjs/common";
import { GenerationsModule } from "../generations/generations.module";
import { FrontPageController } from "./front-page.controller";
import { FrontPageSchedule } from "./front-page.schedule";
import { FrontPageService } from "./front-page.service";

@Module({
  imports: [GenerationsModule],
  controllers: [FrontPageController],
  providers: [FrontPageService, FrontPageSchedule],
})
export class FrontPageModule {}
