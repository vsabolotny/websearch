/** Parse a German-formatted number out of free text, e.g. "1.250 €" -> 1250, "32,5" -> 32.5. */
export function parseGermanNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\d[\d.]*(?:,\d+)?/);
  if (!match) return null;
  const normalized = match[0].replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}
