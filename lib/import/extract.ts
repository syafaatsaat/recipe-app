// HTML page → the recipe it describes: JSON-LD first, then microdata (doc §1
// "Scraping"). Pure: takes the HTML string, does no fetching.
import * as cheerio from "cheerio";
import { z } from "zod";

export interface ExtractedIngredient {
  /** "For the glaze", or null for the main list */
  section: string | null;
  text: string;
}

/** What gets stored in import_jobs.raw_payload, and re-parsed by the review page. */
export interface ExtractedRecipe {
  method: "jsonld" | "microdata" | "paste";
  title: string | null;
  description: string | null;
  ingredients: ExtractedIngredient[];
  steps: string[];
  yieldText: string | null;
  prepMin: number | null;
  cookMin: number | null;
  imageUrl: string | null;
  siteName: string | null;
  /** the page's canonical URL, else the URL that was fetched; null for pasted text */
  url: string | null;
}

/** import_jobs.raw_payload is written by the server, but RLS lets its owner edit it: check it on read. */
export const extractedRecipeSchema = z.object({
  method: z.enum(["jsonld", "microdata", "paste"]),
  title: z.string().nullable(),
  description: z.string().nullable(),
  ingredients: z.array(z.object({ section: z.string().nullable(), text: z.string() })).max(500),
  steps: z.array(z.string()).max(500),
  yieldText: z.string().nullable(),
  prepMin: z.number().int().min(0).max(10_000).nullable(),
  cookMin: z.number().int().min(0).max(10_000).nullable(),
  imageUrl: z.string().nullable(),
  siteName: z.string().nullable(),
  url: z.string().nullable(),
});

const MAX_TEXT = 5000;

/** Decodes entities and drops tags: JSON-LD strings often carry both. */
export function plainText(s: unknown): string {
  if (typeof s !== "string" && typeof s !== "number") return "";
  const str = String(s);
  const text = /[<&]/.test(str) ? cheerio.load(`<div>${str}</div>`)("div").first().text() : str;
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

/** ISO 8601 duration ("PT1H30M", "P0DT0H20M") → whole minutes. */
export function isoMinutes(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(v.trim());
  if (!m || v.trim().length <= 2) return null;
  const [, d, h, min, sec] = m.map((x) => (x === undefined ? 0 : Number(x)));
  const total = Math.round(d * 1440 + h * 60 + min + sec / 60);
  return total > 0 && total <= 10_000 ? total : null;
}

const isType = (node: Record<string, unknown>, type: string) => {
  const t = node["@type"];
  return t === type || (Array.isArray(t) && t.includes(type));
};

/** Every object in a JSON-LD document, walking @graph, arrays and nesting (mainEntity etc.). */
function* nodes(v: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 6 || v === null || typeof v !== "object") return;
  if (Array.isArray(v)) {
    for (const x of v) yield* nodes(x, depth + 1);
    return;
  }
  const o = v as Record<string, unknown>;
  yield o;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement"]) {
    if (key in o) yield* nodes(o[key], depth + 1);
  }
}

function firstString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = firstString(x);
      if (s) return s;
    }
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return firstString(o.url ?? o["@id"] ?? o.name ?? null);
  }
  return null;
}

/** recipeYield is a number, a string, or an array of both ("8", "8 slices"): prefer one with a word. */
function yieldOf(v: unknown): string | null {
  const all = (Array.isArray(v) ? v : [v]).map((x) => plainText(x)).filter(Boolean);
  return all.find((s) => /[a-z]/i.test(s)) ?? all[0] ?? null;
}

/** recipeInstructions: a string, strings, HowToStep or HowToSection (flattened). */
function stepsOf(v: unknown, depth = 0): string[] {
  if (depth > 4 || v === null || v === undefined) return [];
  if (typeof v === "string") {
    // one string may hold several steps, one per line or <li>
    if (/<li[\s>]/i.test(v)) {
      const $ = cheerio.load(v);
      return $("li").map((_, el) => plainText($(el).html() ?? "")).get().filter(Boolean);
    }
    return v.split(/\r?\n+|<br\s*\/?>/i).map(plainText).filter(Boolean);
  }
  if (Array.isArray(v)) return v.flatMap((x) => stepsOf(x, depth + 1));
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (isType(o, "HowToSection") || Array.isArray(o.itemListElement)) return stepsOf(o.itemListElement, depth + 1);
    const t = plainText(o.text ?? o.name ?? "");
    return t ? [t] : [];
  }
  return [];
}

/** recipeIngredient (or the old `ingredients`), with "For the glaze:" lines turned into sections. */
export function withSections(lines: readonly string[]): ExtractedIngredient[] {
  let section: string | null = null;
  const out: ExtractedIngredient[] = [];
  for (const raw of lines) {
    const text = plainText(raw);
    if (!text) continue;
    const heading = /^(?:for (?:the )?)?([^\d¼½¾⅓⅔⅛]{2,60}?):$/i.exec(text) ?? /^for (?:the )?([a-z][a-z ]{1,40})$/i.exec(text);
    if (heading) {
      section = heading[0].replace(/:$/, "").replace(/^\w/, (c) => c.toUpperCase());
      continue;
    }
    out.push({ section, text });
  }
  return out;
}

function meta($: cheerio.CheerioAPI, pageUrl: string | null) {
  const siteName =
    $('meta[property="og:site_name"]').attr("content")?.trim() ||
    (pageUrl ? new URL(pageUrl).hostname.replace(/^www\./, "") : null);
  const canonical = $('link[rel="canonical"]').attr("href") || $('meta[property="og:url"]').attr("content") || null;
  let url = pageUrl;
  if (canonical && pageUrl) {
    try {
      const c = new URL(canonical, pageUrl);
      if (c.protocol === "https:" || c.protocol === "http:") url = c.toString();
    } catch {
      /* keep the fetched URL */
    }
  }
  return { siteName: siteName || null, url };
}

function fromJsonLd($: cheerio.CheerioAPI): Record<string, unknown> | null {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    let data: unknown;
    try {
      data = JSON.parse($(el).text().trim().replace(/^<!--|-->$/g, ""));
    } catch {
      continue; // one broken block shouldn't hide a good one
    }
    for (const n of nodes(data)) if (isType(n, "Recipe")) return n;
  }
  return null;
}

function fromMicrodata($: cheerio.CheerioAPI): Omit<ExtractedRecipe, "siteName" | "url"> | null {
  const scope = $('[itemtype*="schema.org/Recipe"]').first();
  if (!scope.length) return null;
  const prop = (name: string) => scope.find(`[itemprop="${name}"]`);
  const value = (el: ReturnType<typeof prop>) =>
    el.attr("content") ?? el.attr("datetime") ?? el.attr("src") ?? plainText(el.html() ?? "");
  const ingredients = prop("recipeIngredient").add(prop("ingredients")).map((_, el) => plainText($(el).html() ?? "")).get();
  if (!ingredients.length) return null;
  const instr = prop("recipeInstructions");
  const steps = instr.find("li").length
    ? instr.find("li").map((_, el) => plainText($(el).html() ?? "")).get()
    : instr.map((_, el) => plainText($(el).html() ?? "")).get();
  return {
    method: "microdata",
    title: plainText(value(prop("name").first())) || null,
    description: plainText(value(prop("description").first())) || null,
    ingredients: withSections(ingredients),
    steps: steps.filter(Boolean),
    yieldText: plainText(value(prop("recipeYield").first())) || null,
    prepMin: isoMinutes(value(prop("prepTime").first())),
    cookMin: isoMinutes(value(prop("cookTime").first())),
    imageUrl: value(prop("image").first()) || null,
  };
}

/** The recipe on an HTML page, or null when it has no structured recipe data. */
export function extractRecipe(html: string, pageUrl: string | null): ExtractedRecipe | null {
  const $ = cheerio.load(html);
  const m = meta($, pageUrl);
  const node = fromJsonLd($);
  if (node) {
    const ingredients = withSections(
      (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : Array.isArray(node.ingredients) ? node.ingredients : [])
        .map((x) => (typeof x === "string" ? x : plainText(x))),
    );
    if (ingredients.length) {
      return {
        method: "jsonld",
        title: plainText(node.name) || null,
        description: plainText(node.description) || null,
        ingredients,
        steps: stepsOf(node.recipeInstructions),
        yieldText: yieldOf(node.recipeYield),
        prepMin: isoMinutes(node.prepTime),
        cookMin: isoMinutes(node.cookTime),
        imageUrl: firstString(node.image),
        ...m,
      };
    }
  }
  const micro = fromMicrodata($);
  return micro ? { ...micro, ...m } : null;
}
