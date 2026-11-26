import "server-only";
import { lookup } from "node:dns/promises";
import { addressesAllowed, allowHostsFromEnv, checkUrl } from "@/lib/import/url-guard";

// Fetches a recipe page for the importer (doc §1). Every hop is checked by the
// SSRF guard before connecting, redirects are followed by hand, and the request
// is bounded in time (20 s, doc §1 "Gotchas") and size.
// Known gap: fetch resolves the name again after our lookup (DNS rebinding). Pinning
// the address needs undici's dispatcher; acceptable for this app, noted in doc §1.

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
// generic on purpose: nothing about the user or the deployment
const USER_AGENT = "Mozilla/5.0 (compatible; RecipeImporter/1.0)";

export type FetchResult = { ok: true; html: string; url: string } | { ok: false; error: string };

export async function fetchPage(input: string): Promise<FetchResult> {
  const allow = allowHostsFromEnv(process.env.IMPORT_ALLOW_HOSTS, process.env.NODE_ENV);
  let target = input;
  const deadline = AbortSignal.timeout(TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const checked = checkUrl(target, allow);
      if (!checked.ok) return checked;
      const { url } = checked;
      if (!checked.allowListed) {
        const answers = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true, verbatim: true }).catch(() => []);
        if (!answers.length) return { ok: false, error: "Couldn’t find that website. Check the address." };
        if (!addressesAllowed(answers.map((a) => a.address))) return { ok: false, error: "That address can’t be imported." };
      }

      const res = await fetch(url, {
        redirect: "manual",
        signal: deadline,
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        target = new URL(res.headers.get("location")!, url).toString();
        await res.body?.cancel();
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        return {
          ok: false,
          error: res.status === 403 || res.status === 429 || res.status === 503
            ? "That site didn’t let us read the page."
            : `That page answered with an error (${res.status}).`,
        };
      }
      const type = res.headers.get("content-type") ?? "";
      if (!/html/i.test(type)) {
        await res.body?.cancel();
        return { ok: false, error: "That link isn’t a web page." };
      }
      const html = await readCapped(res);
      if (html === null) return { ok: false, error: "That page is too large to read." };
      return { ok: true, html, url: url.toString() };
    }
    return { ok: false, error: "That link redirects too many times." };
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { ok: false, error: "That site took too long to answer." };
    }
    return { ok: false, error: "Couldn’t reach that site." };
  }
}

async function readCapped(res: Response): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
