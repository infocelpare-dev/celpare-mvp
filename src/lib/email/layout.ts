/*
  One look for every email the app sends itself (D191). The same card as the
  Supabase code templates: off white canvas, white card, ink text, an ink pill
  for the one action. Inline styles only, because mail clients drop <style>.

  Pure and dependency free so the builders can be tested with node --test.
  Every value that is not a literal in this repo goes through escapeHtml.
*/

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Links point at NEXT_PUBLIC_SITE_URL, which is localhost until publish (DOM.9). */
export function siteUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

export type EmailBody = {
  heading: string;
  paragraphs: string[];
  details?: { label: string; value: string }[];
  action?: { label: string; href: string };
  footnote?: string;
};

const INK = "#1C1C1C";
const MUTED = "#57534E";
const FAINT = "#78716C";

export function renderEmail(b: EmailBody): { html: string; text: string } {
  const paragraphs = b.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${MUTED}">${escapeHtml(p)}</p>`,
    )
    .join("");

  const details = b.details?.length
    ? `<table role="presentation" style="width:100%;margin:0 0 20px;border-collapse:collapse;font-size:14px">${b.details
        .map(
          (d) =>
            `<tr><td style="padding:8px 12px 8px 0;color:${FAINT};vertical-align:top;white-space:nowrap">${escapeHtml(d.label)}</td><td style="padding:8px 0;color:${INK};white-space:pre-wrap;word-break:break-word">${escapeHtml(d.value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const action = b.action
    ? `<p style="margin:8px 0 24px"><a href="${escapeHtml(b.action.href)}" style="display:inline-block;background:${INK};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:999px">${escapeHtml(b.action.label)}</a></p>`
    : "";

  const footnote = b.footnote
    ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${FAINT}">${escapeHtml(b.footnote)}</p>`
    : "";

  const html = `<div style="background:#FAFAF9;padding:32px 16px;font-family:Inter,Helvetica,Arial,sans-serif;color:${INK}">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E5E4;border-radius:16px;padding:32px">
    <p style="margin:0 0 24px;font-size:18px;font-weight:600;letter-spacing:-0.01em">Celpare</p>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:500;letter-spacing:-0.02em;color:${INK}">${escapeHtml(b.heading)}</h1>
    ${paragraphs}${details}${action}${footnote}
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#A8A29E;text-align:center">Celpare. Right tool. Right result.</p>
</div>`;

  const text = [
    b.heading,
    "",
    ...b.paragraphs.flatMap((p) => [p, ""]),
    ...(b.details ?? []).map((d) => `${d.label}: ${d.value}`),
    ...(b.details?.length ? [""] : []),
    ...(b.action ? [`${b.action.label}: ${b.action.href}`, ""] : []),
    ...(b.footnote ? [b.footnote, ""] : []),
    "Celpare. Right tool. Right result.",
  ].join("\n");

  return { html, text };
}
