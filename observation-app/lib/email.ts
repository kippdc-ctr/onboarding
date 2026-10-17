// Resident feedback email (Section 6). Pure function: used for the live preview on the scoring screen
// and for the "Copy email" button on the observation page. Inline styles so it pastes into Gmail intact.

export type EmailStep = { text: string; lookFors: string; practice: string; resourceUrl: string; note: string };
export type EmailIndicator = { code: string; name: string; score: number; label: string; demonstrated: string[]; toBuild: string[] };
export type EmailInput = {
  firstName: string;
  observerName: string;
  dateLabel: string;
  affirming: string;
  adjusting: string;
  steps: EmailStep[];
  includeSnapshot: boolean;
  snapshot: EmailIndicator[];
  nextNote: string;
  rubricNote: string;
};

const TEAL = "#2C6A74";
const CORAL = "#ED4D44";
const GOLD_WASH = "#FDF7DD";
const TEAL_WASH = "#E8F6F7";
const CORAL_WASH = "#FDECEB";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function paras(s: string): string {
  return s
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 10px 0">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
function bullets(s: string): string {
  const items = s.split("\n").map((x) => x.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
  if (items.length <= 1) return paras(s);
  return `<ul style="margin:4px 0 8px 20px;padding:0">${items.map((i) => `<li style="margin:0 0 4px 0">${esc(i)}</li>`).join("")}</ul>`;
}
function safeUrl(u: string): string | null {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function emailSubject(dateLabel: string): string {
  return `[CTR] Observation feedback, ${dateLabel}`;
}

export function buildEmail(e: EmailInput): { subject: string; html: string; text: string } {
  const subject = emailSubject(e.dateLabel);
  const h2 = (t: string) => `<h3 style="margin:18px 0 6px 0;font-size:16px;color:${TEAL}">${esc(t)}</h3>`;
  const firstLine = e.affirming.trim().split(/(?<=[.!?])\s|\n/)[0] ?? "";
  const html: string[] = [];
  html.push(`<div style="font-family:Calibri,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1F2A2E;max-width:640px">`);
  html.push(`<p style="margin:0 0 10px 0">Hi ${esc(e.firstName)},</p>`);
  html.push(
    `<p style="margin:0 0 10px 0">Thank you for having me in your classroom on ${esc(e.dateLabel)}.${firstLine ? ` I especially noticed: ${esc(firstLine)}` : ""}</p>`,
  );
  if (e.affirming.trim()) html.push(h2("What is working"), `<div style="background:${TEAL_WASH};border-radius:8px;padding:10px 14px">${paras(e.affirming)}</div>`);
  if (e.adjusting.trim()) html.push(h2("What to adjust"), `<div style="background:${GOLD_WASH};border-radius:8px;padding:10px 14px">${paras(e.adjusting)}</div>`);
  if (e.steps.length) {
    html.push(h2(e.steps.length > 1 ? "Your action steps" : "Your action step"));
    e.steps.forEach((s, i) => {
      const url = s.resourceUrl ? safeUrl(s.resourceUrl) : null;
      html.push(
        `<div style="border-left:5px solid ${CORAL};background:${CORAL_WASH};border-radius:8px;padding:10px 14px;margin:0 0 10px 0">`,
        `<p style="margin:0 0 6px 0;font-weight:bold">${e.steps.length > 1 ? `${i + 1}. ` : ""}${esc(s.text)}</p>`,
        s.note.trim() ? `<p style="margin:0 0 6px 0;font-style:italic">${esc(s.note)}</p>` : "",
        s.lookFors.trim() ? `<p style="margin:6px 0 2px 0;font-weight:bold;color:${TEAL}">What it looks like when it's working</p>${bullets(s.lookFors)}` : "",
        s.practice.trim() ? `<p style="margin:6px 0 2px 0;font-weight:bold;color:${TEAL}">Practice this week</p>${paras(s.practice)}` : "",
        url ? `<p style="margin:6px 0 0 0"><a href="${esc(url)}" style="color:${TEAL}">Resource</a></p>` : "",
        `</div>`,
      );
    });
  }
  if (e.includeSnapshot && e.snapshot.length) {
    html.push(h2("Indicator snapshot"));
    for (const s of e.snapshot) {
      html.push(
        `<p style="margin:0 0 2px 0"><b>${esc(s.code)} ${esc(s.name)}</b>: ${esc(s.label)}</p>`,
        s.demonstrated.length ? `<p style="margin:0 0 2px 12px">Demonstrated: ${esc(s.demonstrated.join("; "))}</p>` : "",
        s.toBuild.length ? `<p style="margin:0 0 8px 12px">Still to build: ${esc(s.toBuild.join("; "))}</p>` : `<p style="margin:0 0 8px 0"></p>`,
      );
    }
    if (e.rubricNote.trim()) html.push(`<p style="margin:4px 0 0 0;font-size:13px;color:#5C5655"><i>${esc(e.rubricNote)}</i></p>`);
  }
  html.push(h2("What happens next"), paras(e.nextNote || "Reply to this email with any questions."));
  html.push(`<p style="margin:16px 0 0 0">${esc(e.observerName)}<br><span style="color:#5C5655">Capital Teaching Residency</span></p>`);
  html.push(`</div>`);

  const t: string[] = [];
  t.push(`Hi ${e.firstName},`, "", `Thank you for having me in your classroom on ${e.dateLabel}.${firstLine ? ` I especially noticed: ${firstLine}` : ""}`);
  if (e.affirming.trim()) t.push("", "WHAT IS WORKING", e.affirming.trim());
  if (e.adjusting.trim()) t.push("", "WHAT TO ADJUST", e.adjusting.trim());
  if (e.steps.length) {
    t.push("", e.steps.length > 1 ? "YOUR ACTION STEPS" : "YOUR ACTION STEP");
    e.steps.forEach((s, i) => {
      t.push(`${e.steps.length > 1 ? `${i + 1}. ` : ""}${s.text}`);
      if (s.note.trim()) t.push(s.note.trim());
      if (s.lookFors.trim()) t.push("What it looks like when it's working:", s.lookFors.trim());
      if (s.practice.trim()) t.push("Practice this week:", s.practice.trim());
      if (s.resourceUrl.trim()) t.push(`Resource: ${s.resourceUrl.trim()}`);
      t.push("");
    });
  }
  if (e.includeSnapshot && e.snapshot.length) {
    t.push("INDICATOR SNAPSHOT");
    for (const s of e.snapshot) {
      t.push(`${s.code} ${s.name}: ${s.label}`);
      if (s.demonstrated.length) t.push(`  Demonstrated: ${s.demonstrated.join("; ")}`);
      if (s.toBuild.length) t.push(`  Still to build: ${s.toBuild.join("; ")}`);
    }
    if (e.rubricNote.trim()) t.push(e.rubricNote.trim());
  }
  t.push("", "WHAT HAPPENS NEXT", e.nextNote || "Reply to this email with any questions.", "", e.observerName, "Capital Teaching Residency");
  return { subject, html: html.join(""), text: t.join("\n") };
}
