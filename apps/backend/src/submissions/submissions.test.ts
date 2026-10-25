import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { createTestApp, type TestApp } from "../test/support";
import { SubmissionsService } from "./submissions.service";

const testImage = await readFile(new URL("../test/fixtures/test-image.png", import.meta.url));

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await testApp.app.close();
});

/** Spies on the service so tests can see exactly what the controller received. */
function spyOnCreate() {
  return vi.spyOn(testApp.app.get(SubmissionsService), "create");
}

function post(form: FormData): Promise<Response> {
  return fetch(`${testApp.baseUrl}/submissions`, { method: "POST", body: form });
}

test("POST /submissions accepts text without images", async () => {
  const create = spyOnCreate();
  const form = new FormData();
  form.append("text", "Just some text");

  const response = await post(form);

  expect(response.status).toBe(204);
  expect(create).toHaveBeenCalledExactlyOnceWith({ text: "Just some text" }, []);
});

test("POST /submissions accepts text with an image", async () => {
  const create = spyOnCreate();
  const form = new FormData();
  form.append("text", "Text with a photo");
  form.append("images", new Blob([testImage], { type: "image/png" }), "test-image.png");

  const response = await post(form);

  expect(response.status).toBe(204);
  expect(create).toHaveBeenCalledOnce();
  const [input, images] = create.mock.calls[0]!;
  expect(input).toEqual({ text: "Text with a photo" });
  expect(images).toHaveLength(1);
  expect(images[0]).toMatchObject({ filename: "test-image.png", contentType: "image/png" });
  // The exact bytes of the fixture made it through.
  expect(images[0]!.data.equals(testImage)).toBe(true);
});
