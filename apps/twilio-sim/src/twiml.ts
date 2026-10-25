export type TwimlMessage = { body: string; mediaUrls: string[]; to?: string };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity]!).trim();
}

/**
 * Extracts the <Message> replies from a TwiML webhook response. Handles both forms Twilio accepts:
 * `<Message>text</Message>` and `<Message><Body>text</Body><Media>url</Media></Message>`.
 * Other verbs are ignored; this isn't a full TwiML interpreter.
 */
export function parseTwimlMessages(xml: string): TwimlMessage[] {
  const messages: TwimlMessage[] = [];
  for (const match of xml.matchAll(/<Message\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Message>)/g)) {
    const attributes = match[1] ?? "";
    const inner = match[2] ?? "";
    const mediaUrls = [...inner.matchAll(/<Media>([\s\S]*?)<\/Media>/g)].map((m) => decode(m[1]!));
    const body = /<Body>([\s\S]*?)<\/Body>/.exec(inner)?.[1];
    const to = /\bto="([^"]*)"/.exec(attributes)?.[1];
    messages.push({
      body: decode(body ?? inner.replace(/<Media>[\s\S]*?<\/Media>/g, "")),
      mediaUrls,
      ...(to ? { to: decode(to) } : {}),
    });
  }
  return messages;
}
