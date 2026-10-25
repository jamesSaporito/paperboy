function split(address: string): [local: string, domain: string] {
  const at = address.lastIndexOf("@");
  return [address.slice(0, at).toLowerCase(), address.slice(at + 1).toLowerCase()];
}

/**
 * A contact's private address: the app's mailbox with their token as a `+` suffix. Gmail delivers
 * `name+anything@gmail.com` to `name@gmail.com`.
 */
export function inboundAddress(mailAddress: string, token: string): string {
  const [local, domain] = split(mailAddress);
  return `${local}+${token}@${domain}`;
}

/** The token in `address`, if it's one of `mailAddress`'s `+` addresses. */
export function inboundToken(mailAddress: string, address: string): string | null {
  const [local, domain] = split(mailAddress);
  const [recipientLocal, recipientDomain] = split(address);
  if (recipientDomain !== domain || !recipientLocal.startsWith(`${local}+`)) return null;
  return recipientLocal.slice(local.length + 1) || null;
}

export function domainOf(address: string): string {
  return split(address)[1];
}
