import { createHmac, randomBytes } from "node:crypto";

/**
 * Twilio's X-Twilio-Signature: HMAC-SHA1 (keyed with the auth token) of the full webhook URL
 * followed by each POST parameter's name and value, sorted by name, base64-encoded.
 */
export function signWebhook(authToken: string, url: string, params: Record<string, string>) {
  const data = Object.keys(params)
    .toSorted()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

/** A Twilio-style SID: two-letter prefix (SM message, MM media message, ME media) + 32 hex. */
export function sid(prefix: "SM" | "MM" | "ME"): string {
  return prefix + randomBytes(16).toString("hex");
}
