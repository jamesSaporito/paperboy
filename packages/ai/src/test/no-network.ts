// Tests must never call the real OpenAI API: it costs money. Every test gives the client a fake
// `fetch` (see fake-openai.ts); this makes anything that slips past that fail instead of spending.
for (const name of Object.keys(process.env)) {
  if (name.startsWith("OPENAI_")) delete process.env[name];
}

globalThis.fetch = () =>
  Promise.reject(new Error("Network access is disabled in @paperboy/ai tests"));
