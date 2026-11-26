import { formatQuantity } from "@/lib/culinary/quantity";

export function yieldText(qty: number | null, unit: string | null): string | null {
  if (qty === null) return null;
  return [formatQuantity(qty), unit].filter(Boolean).join(" ");
}

export function minutesText(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
