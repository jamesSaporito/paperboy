import { Global, Module } from "@nestjs/common";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().default(3100),
  DATABASE_URL: z.url(),
  /// Twilio credentials: webhook signatures are checked with the auth token, and media downloads
  /// use both. Locally these match the simulator's (apps/twilio-sim).
  TWILIO_ACCOUNT_SID: z.string().regex(/^AC[0-9a-f]{32}$/),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  /// The mailbox the app reads and sends from: a dedicated Gmail account and its app password.
  /// Defaults are Gmail's; locally the hosts point at GreenMail (see docker-compose.yml).
  // The browser rule for email addresses, which allows local hosts like paperboy@localhost.
  MAIL_ADDRESS: z.email({ pattern: z.regexes.html5Email }),
  MAIL_PASSWORD: z.string().min(1),
  MAIL_IMAP_HOST: z.string().default("imap.gmail.com"),
  MAIL_IMAP_PORT: z.coerce.number().int().default(993),
  MAIL_IMAP_SECURE: z.stringbool().default(true),
  MAIL_SMTP_HOST: z.string().default("smtp.gmail.com"),
  MAIL_SMTP_PORT: z.coerce.number().int().default(465),
  MAIL_SMTP_SECURE: z.stringbool().default(true),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Injection token for the validated environment. Tests can override it with their own values. */
export const ENV = Symbol("ENV");

@Global()
@Module({ providers: [{ provide: ENV, useFactory: loadEnv }], exports: [ENV] })
export class EnvModule {}
