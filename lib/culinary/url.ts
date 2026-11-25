// Scale state ⇄ URL query (docs/design.md §3.5): ?mode=factor&f=2 · ?mode=yield&qty=36
// · ?mode=pan&pan=<id>&depth=1, plus &units=us|metric. Invalid input never throws: it falls back to none.
import { scaleStateSchema, unitSystemSchema, type ScaleState } from "./schemas";
import type { UnitSystem } from "./units";

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function getter(params: Params): (k: string) => string | undefined {
  if (params instanceof URLSearchParams) return (k) => params.get(k) ?? undefined;
  return (k) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
}

/** Number(""), Number(" ") are 0 and Number("0x10") is 16: only accept plain decimals. */
function num(s: string | undefined): number {
  return s !== undefined && /^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(s) ? Number(s) : NaN;
}

export function parseScaleParams(params: Params): { scale: ScaleState; units: UnitSystem | null } {
  const get = getter(params);
  const unitsParsed = unitSystemSchema.safeParse(get("units"));
  const units = unitsParsed.success ? unitsParsed.data : null;

  let candidate: unknown;
  switch (get("mode")) {
    case "factor": candidate = { mode: "factor", factor: num(get("f")) }; break;
    case "yield":  candidate = { mode: "yield", targetQty: num(get("qty")) }; break;
    case "pan":    candidate = { mode: "pan", targetPanId: get("pan"), useDepth: get("depth") === "1" }; break;
    default:       candidate = { mode: "none" };
  }
  const parsed = scaleStateSchema.safeParse(candidate);
  return { scale: parsed.success ? parsed.data : { mode: "none" }, units };
}

export function toScaleParams(scale: ScaleState, units?: UnitSystem | null): URLSearchParams {
  const p = new URLSearchParams();
  switch (scale.mode) {
    case "none": break;
    case "factor": p.set("mode", "factor"); p.set("f", String(scale.factor)); break;
    case "yield": p.set("mode", "yield"); p.set("qty", String(scale.targetQty)); break;
    case "pan":
      p.set("mode", "pan");
      p.set("pan", scale.targetPanId);
      if (scale.useDepth) p.set("depth", "1");
      break;
  }
  if (units) p.set("units", units);
  return p;
}
