// Serves the hand-written recipe pages in e2e/fixtures/sites/ for the import flows.
// The dev server may fetch it only because playwright.config.ts sets
// IMPORT_ALLOW_HOSTS=127.0.0.1:4010 (ignored in production, lib/import/url-guard.ts).
// It also stands in for the Claude API (POST /v1/messages, doc §3.11): the e2e dev
// server gets ANTHROPIC_BASE_URL pointing here, so tests never call the real API.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const PORT = 4010;
const dir = new URL("./fixtures/sites/", import.meta.url);

const reply = (res, value, stop = "end_turn") => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    id: "msg_e2e", type: "message", role: "assistant", model: "claude-haiku-5-5",
    content: stop === "refusal" ? [] : [{ type: "text", text: JSON.stringify(value) }],
    stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 200 },
  }));
};

const GREEN_SOUP = {
  found: true,
  title: "Green soup",
  description: "A quick soup for cold nights, ready in half an hour and good for using up greens.",
  yieldText: "Serves 4",
  prepMinutes: 10,
  cookMinutes: 20,
  ingredients: [
    { section: null, text: "2 tbsp olive oil" },
    { section: null, text: "1 onion, chopped" },
    { section: null, text: "1 cup or 2 handfuls spinach" },
    { section: null, text: "4 cups vegetable stock" },
    { section: "To serve", text: "2 tbsp cream" },
    // not on the page: the app must drop it
    { section: null, text: "1 tsp truffle oil" },
  ],
  steps: ["Soften the onion in the olive oil for 8 minutes.", "Add the stock and simmer for 10 minutes, then stir in the spinach and blend."],
};
const NONE = { found: false, title: null, description: null, yieldText: null, prepMinutes: null, cookMinutes: null, ingredients: [], steps: [] };

/** canned answers, picked by what the request asks about */
function messages(body, res) {
  const prompt = JSON.stringify(body.messages ?? []);
  if (prompt.includes("<page>")) {
    if (prompt.includes("Mystery stew")) return reply(res, null, "refusal");
    return reply(res, prompt.includes("Green soup") ? GREEN_SOUP : NONE);
  }
  const lines = [...prompt.matchAll(/(\d+): ([^\\]*?)(?=\\n|$)/g)].map((m) => ({ index: Number(m[1]), text: m[2] }));
  const spinach = lines.find((l) => l.text.includes("handfuls spinach"));
  return reply(res, {
    lines: spinach
      ? [{ index: spinach.index, quantity: 1, quantityMax: null, unit: "cup", name: "spinach", preparation: null, note: "or 2 handfuls", optional: false }]
      : [],
  });
}

createServer(async (req, res) => {
  if (req.method === "POST" && new URL(req.url ?? "/", "http://x").pathname === "/v1/messages") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    return messages(JSON.parse(raw), res);
  }
  const name = new URL(req.url ?? "/", "http://x").pathname.replace(/^\/+/, "");
  if (name === "health") return res.end("ok");
  // the lemon cake's photo, shown linked from "their" site (doc §3.12)
  if (name === "cake-photo") {
    res.writeHead(200, { "content-type": "image/svg+xml" });
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#e8c547"/></svg>');
  }
  if (name === "blocked") {
    res.writeHead(403, { "content-type": "text/html" });
    return res.end("<h1>Forbidden</h1>");
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    res.writeHead(404);
    return res.end();
  }
  try {
    const html = await readFile(new URL(`${name}.html`, dir));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT, "127.0.0.1", () => console.log(`fixture sites on http://127.0.0.1:${PORT}`));
