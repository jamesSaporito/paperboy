import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { FrontPageService } from "./front-page.service";

export const FRONT_PAGE_JOB = "front-page";
/** Sundays at 9:00 in New York (EST in winter, EDT in summer). */
export const FRONT_PAGE_CRON = "0 9 * * 0";
export const FRONT_PAGE_TIME_ZONE = "America/New_York";

/**
 * Runs the front page every Sunday morning. It runs in each backend process, so with several
 * instances in production this should move to one external scheduler calling POST /jobs/front-page.
 */
@Injectable()
export class FrontPageSchedule {
  private readonly logger = new Logger(FrontPageSchedule.name);

  constructor(private readonly frontPage: FrontPageService) {}

  @Cron(FRONT_PAGE_CRON, { name: FRONT_PAGE_JOB, timeZone: FRONT_PAGE_TIME_ZONE })
  async weekly(): Promise<void> {
    try {
      const result = await this.frontPage.run();
      this.logger.log(`Scheduled front page: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error(`Scheduled front page failed: ${String(error)}`);
    }
  }
}
