import type { HeaderLines } from "mailparser";
import { domainOf } from "./addresses";

/**
 * Whose Authentication-Results header to trust. Gmail's receiving servers add one at the top of
 * every message they accept; a sender can add their own lower down, so only the first is read.
 */
const AUTHSERV_ID = "mx.google.com";

export function headerValue(line: string): string {
  return line
    .slice(line.indexOf(":") + 1)
    .replaceAll(/\r?\n[ \t]+/g, " ")
    .trim();
}

/** `domain` is `fromDomain` or one of its subdomains (DMARC's relaxed alignment, roughly). */
function aligned(domain: string | undefined, fromDomain: string): boolean {
  if (!domain) return false;
  const normalized = domain.replace(/^@/, "").toLowerCase();
  return normalized === fromDomain || normalized.endsWith(`.${fromDomain}`);
}

/**
 * Whether the receiving server verified that the message really comes from `from`'s domain: DMARC
 * passed, or DKIM or SPF passed for that domain. `From` alone can be forged by anyone.
 */
export function senderIsAuthenticated(headerLines: HeaderLines, from: string): boolean {
  const header = headerLines.find((entry) => entry.key === "authentication-results");
  if (!header) return false;
  // Parenthesized comments are free text, e.g. "(google.com: domain of … designates …)".
  const [authservId, ...results] = headerValue(header.line)
    .replaceAll(/\([^)]*\)/g, "")
    .split(";")
    .map((part) => part.trim());
  if (authservId?.toLowerCase() !== AUTHSERV_ID) return false;

  const fromDomain = domainOf(from);
  return results.some((result) => {
    const [method, ...properties] = result.split(/\s+/);
    const props = new Map(
      properties.map((prop) => [
        prop.slice(0, prop.indexOf("=")),
        prop.slice(prop.indexOf("=") + 1),
      ]),
    );
    switch (method?.toLowerCase()) {
      case "dmarc=pass":
        return aligned(props.get("header.from"), fromDomain);
      case "dkim=pass":
        return aligned(
          props.get("header.d") ?? props.get("header.i")?.split("@").at(-1),
          fromDomain,
        );
      case "spf=pass":
        return aligned(props.get("smtp.mailfrom")?.split("@").at(-1), fromDomain);
      default:
        return false;
    }
  });
}
