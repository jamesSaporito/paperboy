import { Controller, Get, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { HealthResponse } from "@paperboy/contracts";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return { status: "ok", database: "up" };
    } catch (error) {
      this.logger.warn(`Database check failed: ${String(error)}`);
      // 503 so load balancer health checks take the instance out of rotation.
      const body: HealthResponse = { status: "degraded", database: "down" };
      throw new ServiceUnavailableException(body);
    }
  }
}
