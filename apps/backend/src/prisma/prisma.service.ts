import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@paperboy/db";
import { ENV, type Env } from "../env";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.client = createPrismaClient(env.DATABASE_URL);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
