// Which URLs the importer may fetch (SSRF guard). Users type these URLs and the
// server fetches them, so private, loopback and link-local addresses, odd ports
// and non-http schemes are refused. Pure: DNS answers are passed in.
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2001:db8::", 32],
] as const) blocked.addSubnet(net, prefix, "ipv6");

/** True for addresses the server must never connect to on a user's behalf. */
export function isBlockedAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) return blocked.check(address, "ipv4");
  if (v === 6) {
    // IPv4-mapped (::ffff:10.0.0.1) is the IPv4 address in disguise
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    return blocked.check(address, "ipv6");
  }
  return true; // not an IP at all: refuse
}

export type UrlCheck = { ok: true; url: URL; allowListed: boolean } | { ok: false; error: string };

const BAD_URL = "That doesn’t look like a web address. Copy the link from your browser’s address bar.";
const BLOCKED = "That address can’t be imported.";

/**
 * Normalises what someone typed ("example.com/cake" → https://example.com/cake) and
 * refuses what the server must not fetch. `allowHosts` ("127.0.0.1:4010") is for
 * tests only; the caller passes it outside production.
 */
export function checkUrl(input: string, allowHosts: readonly string[] = []): UrlCheck {
  const text = input.trim();
  if (!text || text.length > 2000) return { ok: false, error: BAD_URL };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: BAD_URL };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: BAD_URL };
  if (allowHosts.includes(url.host)) return { ok: true, url, allowListed: true };
  if (url.username || url.password) return { ok: false, error: BLOCKED };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, error: BLOCKED };
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: BLOCKED };
  }
  if (isIP(host)) return isBlockedAddress(host) ? { ok: false, error: BLOCKED } : { ok: true, url, allowListed: false };
  // "intranet", "printer": single-label names only resolve inside a network
  if (!host.includes(".")) return { ok: false, error: BAD_URL };
  return { ok: true, url, allowListed: false };
}

/** Every resolved address must be public, or the fetch is refused. */
export function addressesAllowed(addresses: readonly string[]): boolean {
  return addresses.length > 0 && addresses.every((a) => !isBlockedAddress(a));
}

/** IMPORT_ALLOW_HOSTS, honoured only outside production. */
export function allowHostsFromEnv(value: string | undefined, nodeEnv: string | undefined): string[] {
  if (nodeEnv === "production" || !value) return [];
  return value.split(",").map((h) => h.trim()).filter(Boolean);
}
