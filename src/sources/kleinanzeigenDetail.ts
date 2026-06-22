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
  return match ? parseGermanNumber(match[1]) : null;
}
