import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { text } from "node:stream/consumers";
import twilio from "twilio";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { z } from "zod";
import type { SimConfig } from "./env";
import { portOf, type Sim, startSim } from "./server";

const testImage = await readFile(new URL("./test/fixtures/test-image.png", import.meta.url));

const ACCOUNT_SID = `AC${"0".repeat(32)}`;
const AUTH_TOKEN = "test-auth-token";
const APP_NUMBER = "+15555550100";
const PHONE = "+15555550123";

type Received = { path: string; params: Record<string, string>; signature: string };

/** Stands in for the app: records webhooks and answers with whatever `respond` returns. */
let received: Received[] = [];
let respond: (path: string) => { status: number; type?: string; body: string } = () => ({
  status: 200,
  body: "",
});

async function readParams(req: IncomingMessage): Promise<Record<string, string>> {
  return Object.fromEntries(new URLSearchParams(await text(req)));
}

const app = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.method === "GET" && req.url === "/reply.png") {
    res.writeHead(200, { "content-type": "image/png" }).end(testImage);
    return;
  }
  void readParams(req).then((params) => {
    received.push({
      path: req.url ?? "",
      params,
      signature: String(req.headers["x-twilio-signature"]),
    });
    const { status, type, body } = respond(req.url ?? "");
    res.writeHead(status, type ? { "content-type": type } : {}).end(body);
  });
});

let appUrl: string;
let sim: Sim;

beforeAll(async () => {
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  appUrl = `http://127.0.0.1:${portOf(app)}`;
  const config: SimConfig = {
    port: 0,
    webhookUrl: `${appUrl}/webhook`,
    accountSid: ACCOUNT_SID,
    authToken: AUTH_TOKEN,
    phoneNumber: APP_NUMBER,
  };
  sim = await startSim(config);
});

afterEach(() => {
  received = [];
  respond = () => ({ status: 200, body: "" });
  sim.store.clear();
});

afterAll(async () => {
  await sim.close();
  app.closeAllConnections();
  await new Promise((resolve) => app.close(resolve));
});

/** Sends a message from the simulated phone, as its UI does. */
async function sendFromPhone(body: string, image?: Buffer) {
  const form = new FormData();
  form.append("from", PHONE);
  form.append("body", body);
  if (image)
    form.append("images", new Blob([new Uint8Array(image)], { type: "image/png" }), "photo.png");
  const response = await fetch(`${sim.url}/sim/inbound`, { method: "POST", body: form });
  expect(response.status).toBe(201);
  return z.object({ sid: z.string(), errors: z.array(z.string()) }).parse(await response.json());
}

function isSignedByTwilio({ path, params, signature }: Received): boolean {
  return twilio.validateRequest(AUTH_TOKEN, signature, appUrl + path, params);
}

const messagesUrl = () => `${sim.url}/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
const basicAuth = `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64")}`;

test("an incoming message with a photo reaches the webhook signed, with a fetchable media URL", async () => {
  await sendFromPhone("Hello there", testImage);

  expect(received).toHaveLength(1);
  const webhook = received[0]!;
  expect(webhook.path).toBe("/webhook");
  expect(isSignedByTwilio(webhook)).toBe(true);
  expect(webhook.params).toMatchObject({
    AccountSid: ACCOUNT_SID,
    From: PHONE,
    To: APP_NUMBER,
    Body: "Hello there",
    NumMedia: "1",
    MediaContentType0: "image/png",
    SmsStatus: "received",
  });
  expect(webhook.params.MessageSid).toMatch(/^MM[0-9a-f]{32}$/);

  const media = await fetch(webhook.params.MediaUrl0!);
  expect(media.status).toBe(200);
  expect(media.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await media.arrayBuffer()).equals(testImage)).toBe(true);
});

test("an incoming text without photos sends NumMedia 0 and no media URLs", async () => {
  await sendFromPhone("Just text");

  const { params } = received[0]!;
  expect(params).toMatchObject({ Body: "Just text", NumMedia: "0" });
  expect(params.MessageSid).toMatch(/^SM[0-9a-f]{32}$/);
  expect(params).not.toHaveProperty("MediaUrl0");
});

test("a TwiML reply with media is delivered back to the phone", async () => {
  respond = () => ({
    status: 200,
    type: "text/xml",
    body: `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>Got it &amp; thanks</Body><Media>${appUrl}/reply.png</Media></Message></Response>`,
  });

  await sendFromPhone("Here you go");

  const reply = sim.store.messages.find((m) => m.direction === "outbound-reply");
  expect(reply).toMatchObject({
    from: APP_NUMBER,
    to: PHONE,
    body: "Got it & thanks",
    status: "delivered",
  });
  expect(reply!.media[0]!.data.equals(testImage)).toBe(true);
});

test("the Messages API sends to the phone and reports statuses to the callback", async () => {
  const response = await fetch(messagesUrl(), {
    method: "POST",
    headers: { authorization: basicAuth },
    body: new URLSearchParams([
      ["To", PHONE],
      ["From", APP_NUMBER],
      ["Body", "Your photo is ready"],
      ["MediaUrl", `${appUrl}/reply.png`],
      ["StatusCallback", `${appUrl}/status`],
    ]),
  });

  expect(response.status).toBe(201);
  const message = z.looseObject({ sid: z.string(), uri: z.string() }).parse(await response.json());
  expect(message).toMatchObject({
    account_sid: ACCOUNT_SID,
    to: PHONE,
    from: APP_NUMBER,
    body: "Your photo is ready",
    direction: "outbound-api",
    num_media: "1",
    status: "queued",
  });

  await vi.waitFor(() => expect(sim.store.find(message.sid)?.status).toBe("delivered"));
  const callbacks = received.filter((r) => r.path === "/status");
  expect(callbacks.map((c) => c.params.MessageStatus)).toEqual(["sending", "sent", "delivered"]);
  expect(callbacks.every(isSignedByTwilio)).toBe(true);
  expect(sim.store.find(message.sid)!.media[0]!.data.equals(testImage)).toBe(true);

  const fetched = await fetch(`${sim.url}${message.uri}`, {
    headers: { authorization: basicAuth },
  });
  expect(await fetched.json()).toMatchObject({ sid: message.sid, status: "delivered" });
});

test("the Messages API rejects bad credentials and a From number the account doesn't own", async () => {
  const unauthorized = await fetch(messagesUrl(), {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${ACCOUNT_SID}:wrong`).toString("base64")}` },
    body: new URLSearchParams({ To: PHONE, From: APP_NUMBER, Body: "hi" }),
  });
  expect(unauthorized.status).toBe(401);
  expect(await unauthorized.json()).toMatchObject({ code: 20003 });

  const wrongFrom = await fetch(messagesUrl(), {
    method: "POST",
    headers: { authorization: basicAuth },
    body: new URLSearchParams({ To: PHONE, From: "+15555550199", Body: "hi" }),
  });
  expect(wrongFrom.status).toBe(400);
  expect(await wrongFrom.json()).toMatchObject({ code: 21606 });
});

test("a failing webhook is recorded on the message", async () => {
  respond = () => ({ status: 500, body: "boom" });

  const message = await sendFromPhone("Anyone there?");

  expect(message.errors).toEqual([`Webhook ${appUrl}/webhook returned HTTP 500`]);
});
