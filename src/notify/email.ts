import nodemailer from "nodemailer";
import type { Listing, ReportMode } from "../types.js";
import { amenitySummary } from "../amenities.js";

const SOURCE_LABEL: Record<Listing["source"], string> = {
  immoscout24: "ImmobilienScout24",
  kleinanzeigen: "Kleinanzeigen",
  immosuchmaschine: "immosuchmaschine",
  matchoffice: "MatchOffice",
};

/** True when Gmail SMTP + at least one recipient are configured. */
export function emailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && recipients().length);
}

function recipients(): string[] {
  return (process.env.REPORT_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function meta(l: Listing): string {
  const parts: string[] = [];
  if (l.price) parts.push(l.price);
  if (l.areaSqm != null) parts.push(`${l.areaSqm} m²`);
  if (l.address) parts.push(l.address);
  const flags = amenitySummary(l.tags);
  if (flags) parts.push(flags);
  return parts.join(" · ");
}

function buildHtml(listings: Listing[], regionLabel: string, mode: ReportMode): string {
  const rows = listings
    .map(
      (l) =>
        `<li style="margin-bottom:12px">` +
        `<a href="${l.url}" style="font-weight:600">${escapeHtml(l.title)}</a><br>` +
        `<span style="color:#555">${escapeHtml(meta(l))}</span> ` +
        `<span style="color:#999">— ${SOURCE_LABEL[l.source]}</span>` +
        `</li>`,
    )
    .join("\n");
  const heading =
    mode === "full"
      ? `Gesamtliste — ${listings.length} Inserate in ${escapeHtml(regionLabel)}`
      : `${listings.length} neue Inserate in ${escapeHtml(regionLabel)}`;
  return `<div style="font-family:system-ui,Arial,sans-serif"><h2>${heading}</h2><ul style="padding-left:18px">${rows}</ul></div>`;
}

function buildText(listings: Listing[]): string {
  return listings.map((l) => `- ${l.title}\n  ${meta(l)} — ${SOURCE_LABEL[l.source]}\n  ${l.url}`).join("\n\n");
}

let transport: nodemailer.Transporter | null = null;
function getTransport(): nodemailer.Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return transport;
}

/** Email a single digest report of the given listings to all configured recipients. */
export async function sendReport(
  listings: Listing[],
  opts: { mode: ReportMode; regionLabel: string },
): Promise<void> {
  if (!listings.length) return;
  const subject =
    opts.mode === "full"
      ? `Salon-Monitor ${opts.regionLabel}: Gesamtliste (${listings.length})`
      : `Salon-Monitor ${opts.regionLabel}: ${listings.length} neue Inserate`;
  await getTransport().sendMail({
    from: process.env.GMAIL_USER,
    to: recipients(),
    subject,
    text: buildText(listings),
    html: buildHtml(listings, opts.regionLabel, opts.mode),
  });
}

// `npm run email-test` — sends a sample report to confirm Gmail SMTP works.
if (import.meta.url === `file://${process.argv[1]}`) {
  await sendReport(
    [
      {
        source: "kleinanzeigen",
        profile: "room",
        id: "test",
        title: "Testinserat: Friseur Stuhlmiete",
        price: "750 €",
        priceEur: 750,
        areaSqm: null,
        address: "80333 München, Maxvorstadt",
        url: "https://www.kleinanzeigen.de/",
      },
    ],
    { mode: "new", regionLabel: "München" },
  );
  console.log("Test report sent to:", recipients().join(", "));
}
