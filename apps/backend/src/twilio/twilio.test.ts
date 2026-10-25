import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import twilio from "twilio";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { ENV, type Env } from "../env";
import { SubmissionsService } from "../submissions/submissions.service";
import { createTestApp, type TestApp } from "../test/support";

const testImage = await readFile(new URL("../test/fixtures/test-image.png", import.meta.url));

const MESSAGE_SID = `MM${"a".repeat(32)}`;

let testApp: TestApp;
let env: Env;
let mediaBaseUrl: string;
let mediaAuthHeaders: (string | undefined)[] = [];

/** Stands in for Twilio's media host. Like Twilio with media auth on, it requires Basic auth. */
const mediaServer = createServer((req, res) => {
  mediaAuthHeaders.push(req.headers.authorization);
  const expected = `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`;
  if (req.headers.authorization !== expected) {
    res.writeHead(401).end();
  } else if (req.url === "/Media/ME1") {
    res.writeHead(200, { "content-type": "image/png" }).end(testImage);
  } else if (req.url === "/Media/ME2") {
    res.writeHead(200, { "content-type": "text/vcard" }).end("BEGIN:VCARD\nEND:VCARD\n");
  } else {
    res.writeHead(404).end();
  }
});

beforeAll(async () => {
  testApp = await createTestApp();
  env = testApp.app.get<Env>(ENV);
  await new Promise<void>((resolve) => mediaServer.listen(0, "127.0.0.1", resolve));
  const address = mediaServer.address();
  if (address === null || typeof address === "string") throw new Error("media server not on TCP");
  mediaBaseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(() => {
  vi.restoreAllMocks();
  mediaAuthHeaders = [];
});

afterAll(async () => {
  await testApp.app.close();
  mediaServer.closeAllConnections();
  await new Promise((resolve) => mediaServer.close(resolve));
});

function webhookParams(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    AccountSid: env.TWILIO_ACCOUNT_SID,
    ApiVersion: "2010-04-01",
    MessageSid: MESSAGE_SID,
    SmsSid: MESSAGE_SID,
    SmsMessageSid: MESSAGE_SID,
    SmsStatus: "received",
    From: "+15555550123",
    To: "+15555550100",
    Body: "Hello",
    NumMedia: "0",
    NumSegments: "1",
    ...overrides,
  };
}

/** POSTs the webhook as Twilio does, signed with `authToken` (the real one unless overridden). */
function deliver(params: Record<string, string>, authToken = env.TWILIO_AUTH_TOKEN) {
  const url = `${testApp.baseUrl}/twilio/messages`;
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": twilio.getExpectedTwilioSignature(authToken, url, params),
    },
    body: new URLSearchParams(params),
  });
}

function spyOnCreate() {
  return vi.spyOn(testApp.app.get(SubmissionsService), "create");
}

test("a signed text message is handed to the submissions service and acknowledged with TwiML", async () => {
  const create = spyOnCreate();

  const response = await deliver(webhookParams({ Body: "Just text" }));

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toMatch(/^text\/xml/);
  expect(await response.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  expect(create).toHaveBeenCalledExactlyOnceWith({ text: "Just text" }, []);
});

test("a photo is downloaded with Twilio credentials and passed on byte for byte", async () => {
  const create = spyOnCreate();

  const response = await deliver(
    webhookParams({
      Body: "Look at this",
      NumMedia: "1",
      MediaUrl0: `${mediaBaseUrl}/Media/ME1`,
      MediaContentType0: "image/png",
    }),
  );

  expect(response.status).toBe(200);
  expect(mediaAuthHeaders).toHaveLength(1);
  const [input, images] = create.mock.calls[0]!;
  expect(input).toEqual({ text: "Look at this" });
  expect(images).toHaveLength(1);
  expect(images[0]).toMatchObject({ filename: "ME1.png", contentType: "image/png" });
  expect(images[0]!.data.equals(testImage)).toBe(true);
});

test("attachments that aren't images are skipped", async () => {
  const create = spyOnCreate();

  const response = await deliver(
    webhookParams({
      Body: "",
      NumMedia: "2",
      MediaUrl0: `${mediaBaseUrl}/Media/ME2`,
      MediaContentType0: "text/vcard",
      MediaUrl1: `${mediaBaseUrl}/Media/ME1`,
      MediaContentType1: "image/png",
    }),
  );

  expect(response.status).toBe(200);
  // The vCard isn't even downloaded.
  expect(mediaAuthHeaders).toHaveLength(1);
  const [input, images] = create.mock.calls[0]!;
  expect(input).toEqual({ text: "" });
  expect(images.map((image) => image.filename)).toEqual(["ME1.png"]);
});

test("requests without a valid Twilio signature are rejected", async () => {
  const create = spyOnCreate();

  const forged = await deliver(webhookParams(), "not-the-auth-token");
  const unsigned = await fetch(`${testApp.baseUrl}/twilio/messages`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(webhookParams()),
  });

  expect(forged.status).toBe(403);
  expect(unsigned.status).toBe(403);
  expect(create).not.toHaveBeenCalled();
});

test("a media download that fails returns 502 so Twilio logs the error", async () => {
  const create = spyOnCreate();

  const response = await deliver(
    webhookParams({
      NumMedia: "1",
      MediaUrl0: `${mediaBaseUrl}/Media/missing`,
      MediaContentType0: "image/jpeg",
    }),
  );

  expect(response.status).toBe(502);
  expect(create).not.toHaveBeenCalled();
});
