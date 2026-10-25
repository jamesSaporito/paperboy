import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import type { SimConfig } from "./env";
import { sid, signWebhook } from "./signature";
import { type Media, type Message, type MessageStatus, Store } from "./store";
import { parseTwimlMessages } from "./twiml";
import { UI_HTML } from "./ui";

const API_VERSION = "2010-04-01";
/** Twilio gives up on a webhook after 15 seconds. */
const WEBHOOK_TIMEOUT_MS = 15_000;
const E164 = /^\+[1-9]\d{1,14}$/;

export type Sim = {
  server: Server;
  store: Store;
  /** The simulator's own base URL, e.g. http://localhost:3101. */
  url: string;
  close(): Promise<void>;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
  }
}

/** Twilio's REST error shape, e.g. { code: 21604, message: "...", more_info, status: 400 }. */
function twilioError(status: number, code: number, message: string): HttpError {
  return new HttpError(status, {
    code,
    message,
    more_info: `https://www.twilio.com/docs/errors/${code}`,
    status,
  });
}

/** RFC 2822 with a numeric zone, as Twilio formats dates. */
function rfc2822(date: Date): string {
  return date.toUTCString().replace("GMT", "+0000");
}

/** The port a listening server is bound to. */
export function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Server isn't on a TCP port");
  return address.port;
}

/** A text field of a multipart form; files and missing fields read as "". */
function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function send(res: ServerResponse, status: number, body: unknown, contentType?: string): void {
  if (body instanceof Buffer || typeof body === "string") {
    res.writeHead(status, { "content-type": contentType ?? "text/plain; charset=utf-8" });
    res.end(body);
  } else {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }
}

/** Twilio downloads outgoing media from the app's URLs when it sends the message. */
async function fetchMedia(urls: string[]): Promise<Media[]> {
  return Promise.all(
    urls.map(async (mediaUrl) => {
      const response = await fetch(mediaUrl, { signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Media ${mediaUrl} returned HTTP ${response.status}`);
      return {
        sid: sid("ME"),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
        data: Buffer.from(await response.arrayBuffer()),
      };
    }),
  );
}

export async function startSim(config: SimConfig, port = config.port): Promise<Sim> {
  const store = new Store();
  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (error instanceof HttpError) send(res, error.status, error.body);
      else {
        console.error(error);
        send(res, 500, { message: String(error) });
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  const url = `http://localhost:${portOf(server)}`;
  const publicUrl = config.publicUrl ?? url;
  const accountPath = `/${API_VERSION}/Accounts/${config.accountSid}`;

  function mediaPath(message: Message, media: Media): string {
    return `${accountPath}/Messages/${message.sid}/Media/${media.sid}`;
  }

  /** The simulator's view of a message, for its own UI (media as paths, not bytes). */
  function toSimJson(message: Message) {
    return {
      ...message,
      media: message.media.map((m) => ({ contentType: m.contentType, url: mediaPath(message, m) })),
    };
  }

  /** The Messages API resource, shaped like Twilio's. */
  function toApiJson(message: Message) {
    const uri = `${accountPath}/Messages/${message.sid}.json`;
    return {
      sid: message.sid,
      account_sid: config.accountSid,
      api_version: API_VERSION,
      body: message.body,
      date_created: rfc2822(message.dateCreated),
      date_updated: rfc2822(message.dateCreated),
      date_sent: message.status === "delivered" ? rfc2822(message.dateCreated) : null,
      direction: message.direction,
      error_code: message.status === "failed" ? 11200 : null,
      error_message: message.status === "failed" ? (message.errors[0] ?? null) : null,
      from: message.from,
      messaging_service_sid: null,
      num_media: String(message.numMedia),
      num_segments: "1",
      price: null,
      price_unit: "USD",
      status: message.status,
      subresource_uris: { media: `${accountPath}/Messages/${message.sid}/Media.json` },
      to: message.to,
      uri,
    };
  }

  /** POSTs signed, form-encoded params to an app webhook, the way Twilio does. */
  async function postWebhook(webhookUrl: string, params: Record<string, string>) {
    return fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=utf-8",
        "user-agent": "TwilioProxy/1.1",
        "x-twilio-signature": signWebhook(config.authToken, webhookUrl, params),
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  }

  async function setStatus(message: Message, status: MessageStatus): Promise<void> {
    message.status = status;
    if (!message.statusCallback) return;
    const params: Record<string, string> = {
      AccountSid: config.accountSid,
      ApiVersion: API_VERSION,
      From: message.from,
      To: message.to,
      MessageSid: message.sid,
      MessageStatus: status,
      SmsSid: message.sid,
      SmsStatus: status,
      ...(status === "failed" ? { ErrorCode: "11200" } : {}),
    };
    try {
      await postWebhook(message.statusCallback, params);
    } catch (error) {
      message.errors.push(`Status callback (${status}) failed: ${String(error)}`);
    }
  }

  /** Sends an outgoing message to the simulated phone: fetches media, then reports statuses. */
  async function deliver(message: Message, mediaUrls: string[]): Promise<void> {
    await setStatus(message, "sending");
    try {
      message.media = await fetchMedia(mediaUrls);
    } catch (error) {
      message.errors.push(String(error instanceof Error ? error.message : error));
      await setStatus(message, "failed");
      return;
    }
    await setStatus(message, "sent");
    await setStatus(message, "delivered");
  }

  /** The phone sends a message: deliver Twilio's incoming-message webhook to the app. */
  async function receive(from: string, body: string, images: File[]): Promise<Message> {
    const media = await Promise.all(
      images.map(async (image) => ({
        sid: sid("ME"),
        contentType: image.type || "application/octet-stream",
        data: Buffer.from(await image.arrayBuffer()),
      })),
    );
    const message = store.add({
      sid: sid(media.length ? "MM" : "SM"),
      direction: "inbound",
      from,
      to: config.phoneNumber,
      body,
      media,
      numMedia: media.length,
      status: "received",
      dateCreated: new Date(),
      errors: [],
    });

    const params: Record<string, string> = {
      AccountSid: config.accountSid,
      ApiVersion: API_VERSION,
      MessageSid: message.sid,
      SmsSid: message.sid,
      SmsMessageSid: message.sid,
      SmsStatus: "received",
      From: from,
      To: config.phoneNumber,
      Body: body,
      NumMedia: String(media.length),
      NumSegments: "1",
    };
    media.forEach((m, i) => {
      params[`MediaUrl${i}`] = publicUrl + mediaPath(message, m);
      params[`MediaContentType${i}`] = m.contentType;
    });

    let response: Response;
    try {
      response = await postWebhook(config.webhookUrl, params);
    } catch (error) {
      message.errors.push(`Webhook ${config.webhookUrl} failed: ${String(error)}`);
      return message;
    }
    const text = await response.text();
    if (!response.ok) {
      message.errors.push(`Webhook ${config.webhookUrl} returned HTTP ${response.status}`);
      return message;
    }

    // A TwiML <Message> in the response is a reply to the sender.
    if (/xml/.test(response.headers.get("content-type") ?? "")) {
      for (const reply of parseTwimlMessages(text)) {
        const outgoing = store.add({
          sid: sid(reply.mediaUrls.length ? "MM" : "SM"),
          direction: "outbound-reply",
          from: config.phoneNumber,
          to: reply.to ?? from,
          body: reply.body,
          media: [],
          numMedia: reply.mediaUrls.length,
          status: "queued",
          dateCreated: new Date(),
          errors: [],
        });
        await deliver(outgoing, reply.mediaUrls);
      }
    }
    return message;
  }

  function authenticate(req: IncomingMessage): void {
    const expected = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;
    if (req.headers.authorization !== expected) {
      throw twilioError(401, 20003, "Authenticate");
    }
  }

  async function createMessage(req: IncomingMessage): Promise<Message> {
    const params = new URLSearchParams((await buffer(req)).toString("utf8"));
    const to = params.get("To");
    const from = params.get("From");
    const body = params.get("Body") ?? "";
    const mediaUrls = params.getAll("MediaUrl");
    if (!to) throw twilioError(400, 21604, "A 'To' phone number is required.");
    if (!E164.test(to)) throw twilioError(400, 21211, `Invalid 'To' Phone Number: ${to}`);
    if (!from) throw twilioError(400, 21603, "A 'From' phone number is required.");
    if (from !== config.phoneNumber) {
      throw twilioError(
        400,
        21606,
        `The From phone number ${from} is not a valid, SMS-capable inbound phone number or short code for your account.`,
      );
    }
    if (!body && mediaUrls.length === 0) {
      throw twilioError(400, 21602, "Message body is required.");
    }

    const statusCallback = params.get("StatusCallback");
    const message = store.add({
      sid: sid(mediaUrls.length ? "MM" : "SM"),
      direction: "outbound-api",
      from,
      to,
      body,
      media: [],
      numMedia: mediaUrls.length,
      status: "queued",
      dateCreated: new Date(),
      errors: [],
      ...(statusCallback ? { statusCallback } : {}),
    });
    // Twilio answers 201 "queued" right away and delivers afterwards, after the response is built.
    setImmediate(() => void deliver(message, mediaUrls));
    return message;
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { pathname } = new URL(req.url ?? "/", "http://sim");
    const route = `${req.method} ${pathname}`;

    // --- the simulated phone (UI and its API)
    if (route === "GET /") return send(res, 200, UI_HTML, "text/html; charset=utf-8");
    if (route === "GET /sim/info") {
      return send(res, 200, { phoneNumber: config.phoneNumber, webhookUrl: config.webhookUrl });
    }
    if (route === "GET /sim/messages") return send(res, 200, store.messages.map(toSimJson));
    if (route === "POST /sim/reset") {
      store.clear();
      return send(res, 204, "");
    }
    if (route === "POST /sim/inbound") {
      const form = await new Request("http://sim/sim/inbound", {
        method: "POST",
        headers: { "content-type": req.headers["content-type"] ?? "" },
        body: Readable.toWeb(req) as ReadableStream,
        duplex: "half",
      }).formData();
      const from = field(form, "from");
      if (!E164.test(from)) throw new HttpError(400, { message: "from must be an E.164 number" });
      const images = form
        .getAll("images")
        .filter((v): v is File => v instanceof File && v.size > 0);
      const message = await receive(from, field(form, "body"), images);
      return send(res, 201, toSimJson(message));
    }

    // --- Twilio's REST API (the subset an app sending messages needs)
    if (route === `POST ${accountPath}/Messages.json`) {
      authenticate(req);
      return send(res, 201, toApiJson(await createMessage(req)));
    }
    const fetchMatch = new RegExp(`^${accountPath}/Messages/(\\w+)\\.json$`).exec(pathname);
    if (req.method === "GET" && fetchMatch) {
      authenticate(req);
      const message = store.find(fetchMatch[1]!);
      if (!message)
        throw twilioError(404, 20404, `The requested resource ${pathname} was not found`);
      return send(res, 200, toApiJson(message));
    }
    // Media URLs are public by default on Twilio, so no auth here.
    const mediaMatch = new RegExp(`^${accountPath}/Messages/(\\w+)/Media/(\\w+)$`).exec(pathname);
    if (req.method === "GET" && mediaMatch) {
      const media = store.findMedia(mediaMatch[1]!, mediaMatch[2]!);
      if (!media) throw twilioError(404, 20404, `The requested resource ${pathname} was not found`);
      return send(res, 200, media.data, media.contentType);
    }

    throw new HttpError(404, { message: `No route for ${route}` });
  }

  return {
    server,
    store,
    url,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
