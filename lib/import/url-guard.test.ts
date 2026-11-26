import { describe, expect, it } from "vitest";
import { addressesAllowed, allowHostsFromEnv, checkUrl, isBlockedAddress } from "./url-guard";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fe80::1", "fd00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "not-an-ip",
  ])("blocks %s", (a) => expect(isBlockedAddress(a)).toBe(true));

  it.each(["93.184.216.34", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (a) =>
    expect(isBlockedAddress(a)).toBe(false),
  );
});

describe("checkUrl", () => {
  it("adds https:// when it's missing", () => {
    const r = checkUrl("  example.com/lemon-cake ");
    expect(r).toMatchObject({ ok: true, allowListed: false });
    if (r.ok) expect(r.url.toString()).toBe("https://example.com/lemon-cake");
  });

  it("keeps http and https", () => {
    expect(checkUrl("http://example.com/a").ok).toBe(true);
    expect(checkUrl("https://example.com:443/a").ok).toBe(true);
  });

  it.each(["", "not a url", "ftp://example.com/x", "javascript:alert(1)", "file:///etc/passwd", "https://intranet/x", "x".repeat(2001)])(
    "refuses %j as not a web address",
    (u) => expect(checkUrl(u)).toMatchObject({ ok: false, error: expect.stringMatching(/web address/) }),
  );

  it.each([
    "http://localhost:3000", "http://127.0.0.1/", "http://[::1]/", "http://10.0.0.5/x", "http://169.254.169.254/latest/meta-data",
    "https://user:pw@example.com/", "https://example.com:8080/", "http://printer.local/", "http://db.internal/", "http://app.localhost/",
  ])("refuses %s", (u) => expect(checkUrl(u)).toEqual({ ok: false, error: "That address can’t be imported." }));

  it("lets allow-listed test hosts through", () => {
    expect(checkUrl("http://127.0.0.1:4010/cake.html", ["127.0.0.1:4010"])).toMatchObject({ ok: true, allowListed: true });
    expect(checkUrl("http://127.0.0.1:4011/cake.html", ["127.0.0.1:4010"]).ok).toBe(false);
  });
});

describe("addressesAllowed", () => {
  it("needs every address to be public", () => {
    expect(addressesAllowed(["93.184.216.34"])).toBe(true);
    expect(addressesAllowed(["93.184.216.34", "10.0.0.1"])).toBe(false);
    expect(addressesAllowed([])).toBe(false);
  });
});

describe("allowHostsFromEnv", () => {
  it("is ignored in production", () => {
    expect(allowHostsFromEnv("127.0.0.1:4010", "production")).toEqual([]);
    expect(allowHostsFromEnv("127.0.0.1:4010, localhost:5000", "development")).toEqual(["127.0.0.1:4010", "localhost:5000"]);
    expect(allowHostsFromEnv(undefined, "test")).toEqual([]);
  });
});
