import { afterAll, beforeAll, expect, test } from "vitest";
import { createTestApp, type TestApp } from "../test/support";

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
});

afterAll(async () => {
  await testApp.app.close();
});

test("GET /health reports the database as up", async () => {
  const response = await fetch(`${testApp.baseUrl}/health`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", database: "up" });
});
