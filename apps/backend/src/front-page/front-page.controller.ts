import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import type { FrontPageRun } from "@paperboy/contracts";
import { FrontPageService } from "./front-page.service";
import { JobsTokenGuard } from "./jobs-token.guard";

@Controller("jobs")
@UseGuards(JobsTokenGuard)
export class FrontPageController {
  private readonly logger = new Logger(FrontPageController.name);

  constructor(private readonly frontPage: FrontPageService) {}

  /** Runs the weekly front page now, the same as the Sunday schedule. */
  @Post("front-page")
  @HttpCode(HttpStatus.OK)
  async run(): Promise<FrontPageRun> {
    try {
      return await this.frontPage.run();
    } catch (error) {
      this.logger.error(`Front page failed: ${String(error)}`);
      const body: FrontPageRun = { status: "failed" };
      throw new ServiceUnavailableException(body);
    }
  }
}
