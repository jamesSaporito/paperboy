import { z } from "zod";

const envSchema = z.object({
  TWILIO_SIM_PORT: z.coerce.number().int().default(3101),
  /// Base URL the app uses to reach the simulator; media URLs in webhooks point here.
  /// Defaults to http://localhost:<port>.
  TWILIO_SIM_PUBLIC_URL: z.url().optional(),
  /// Where incoming messages are delivered: the app's Twilio messaging webhook.
  TWILIO_SIM_WEBHOOK_URL: z.url(),
  /// Shared with the app: Messages API auth and webhook signatures use these, as with real Twilio.
  TWILIO_ACCOUNT_SID: z.string().regex(/^AC[0-9a-f]{32}$/),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  /// The app's Twilio number: incoming messages are sent to it, and outgoing ones must come from it.
  TWILIO_PHONE_NUMBER: z.string().regex(/^\+[1-9]\d{1,14}$/, "an E.164 number like +15555550100"),
});

export type SimConfig = {
  port: number;
  publicUrl?: string;
  webhookUrl: string;
  accountSid: string;
  authToken: string;
  phoneNumber: string;
};

export function loadConfig(): SimConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  const env = result.data;
  return {
    port: env.TWILIO_SIM_PORT,
    publicUrl: env.TWILIO_SIM_PUBLIC_URL,
    webhookUrl: env.TWILIO_SIM_WEBHOOK_URL,
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    phoneNumber: env.TWILIO_PHONE_NUMBER,
  };
}
