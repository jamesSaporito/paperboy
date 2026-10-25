import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import twilio from "twilio";
import { ENV, type Env } from "../env";

/** Rejects requests that don't carry a valid X-Twilio-Signature for the configured auth token. */
@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const signature = req.get("x-twilio-signature");
    // Twilio signs the exact URL it called. Behind a proxy, enable Express's "trust proxy" so
    // protocol and host reflect the public URL rather than the internal one.
    const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const params: unknown = req.body;
    const body = typeof params === "object" && params !== null ? params : {};
    if (!signature || !twilio.validateRequest(this.env.TWILIO_AUTH_TOKEN, signature, url, body)) {
      throw new ForbiddenException("Invalid Twilio signature");
    }
    return true;
  }
}
