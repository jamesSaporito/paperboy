import { createHash, timingSafeEqual } from "node:crypto";
import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { ENV, type Env } from "../env";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Requires `Authorization: Bearer <JOBS_TOKEN>`; job endpoints call models, which cost money. */
@Injectable()
export class JobsTokenGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    // Compared as fixed-length digests, so neither the token nor its length leaks through timing.
    if (!token || !timingSafeEqual(digest(token), digest(this.env.JOBS_TOKEN))) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
