import * as cheerio from "cheerio";
import { parseGermanNumber } from "../parse.js";

/** Visible description text of a Kleinanzeigen ad detail page (falls back to the page body). */
export function extractDetailText(html: string): string {
  const $ = cheerio.load(html);
  const desc = $("#viewad-description-text").text().trim();
  const raw = desc || $("body").text();
  return raw.replace(/\s+/g, " ").trim();
}

/** First area value ("18 m²", "20 qm", "15,5 m2") found in the text, in m². Null if none. */
export function parseAreaFromText(text: string): number | null {
  const match = text.match(/(\d[\d.,]*)\s*(?:m²|qm|m2)/i);
  if (!match) return null;
  const token = match[1] ?? "";
  // A dot followed by only 1-2 digits is a decimal point ("1.5"), not a German
  // thousands separator (which always groups three digits, "1.500").
  if (/^\d+\.\d{1,2}$/.test(token)) return Number.parseFloat(token);
  return parseGermanNumber(token);
}
