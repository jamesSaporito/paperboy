import { APIConnectionError } from "openai";
import { expect, test } from "vitest";
import { createAi } from "./ai";

test("a client without the fake fetch can't reach OpenAI from tests", async () => {
  const ai = createAi({ apiKey: "sk-test", textModel: "m", imageModel: "m", maxRetries: 0 });

  const error: unknown = await ai.generateText({ prompt: "Hi" }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(APIConnectionError);
  expect(error).toMatchObject({
    cause: {
      message: "Network access is disabled in @paperboy/ai tests",
    },
  });
});
