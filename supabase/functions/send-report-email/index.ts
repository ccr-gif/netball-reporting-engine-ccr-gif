// supabase/functions/send-report-email/index.ts
// Send CSV + HTML via Resend HTTP API (Edge-safe; no SMTP).
// PUBLIC function, protected by a shared secret header (x-fn-key).
//
// Required Edge secrets (server-side only; set via `npx supabase secrets set`):
//   SERVICE_ROLE   = sb_secret_...    (Supabase service role key; server-only)
//   RESEND_API_KEY = re_...           (Resend API key)
//   RESEND_FROM    = "Netball Coach <reports@matchreports.work>"  (verified domain)
//   FN_SHARED_KEY  = a-very-long-random-string                    (used by x-fn-key header)
//
// Injected automatically by the Edge runtime (do NOT set via CLI):
//   SUPABASE_URL

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

// --- helpers ---
function need(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bytesToBase64(u: Uint8Array): string {
  let s = "";
  const CHUNK = 8192;
  for (let i = 0; i < u.length; i += CHUNK) {
    s += String.fromCharCode(...u.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

// --- env ---
const SUPABASE_URL = need("SUPABASE_URL"); // provided by platform
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? // fallback if present
  need("SERVICE_ROLE");

const RESEND_API_KEY = need("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? Deno.env.get("FROM_EMAIL");
if (!RESEND_FROM) throw new Error("Missing env: RESEND_FROM (or FROM_EMAIL)");

const FN_SHARED = need("FN_SHARED_KEY"); // shared secret for header guard

// --- types ---
type Payload = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;

  bucket?: string;        // default "reports"
  csvKey?: string;        // e.g. "Netball_Games/Report.csv"
  htmlKey?: string;       // e.g. "Netball_Games/Report.html"
  csvFilename?: string;   // override attachment filename if desired
  htmlFilename?: string;  // override attachment filename if desired
};

// --- handler ---
Deno.serve(async (req) => {
  try {
    // 0) Shared-secret guard (public endpoint but only callable with your header)
    const callerKey = req.headers.get("x-fn-key") ?? "";
    if (!callerKey || callerKey !== FN_SHARED) {
      return json(401, { error: "unauthorized" });
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method Not Allowed" });
    }

    // 1) Parse & validate input
    const p = (await req.json().catch(() => ({}))) as Payload;
    if (!p?.to?.length || !p.subject) {
      return json(400, { error: "Missing 'to' (array) or 'subject'" });
    }

    const bucket = (p.bucket ?? "reports").replace(/^\/+|\/+$/g, "");
    const csvKey = p.csvKey?.replace(/^\/+/, "");
    const htmlKey = p.htmlKey?.replace(/^\/+/, "");

    // 2) Read attachments using service role
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const attachments: Array<{ filename: string; content: string; type?: string }> = [];

    if (csvKey) {
      const { data, error } = await sb.storage.from(bucket).download(csvKey);
      if (error) return json(400, { error: "CSV download failed", detail: error.message });
      const b64 = bytesToBase64(new Uint8Array(await data.arrayBuffer()));
      attachments.push({
        filename: p.csvFilename || csvKey.split("/").pop() || "report.csv",
        content: b64,
        type: "text/csv",
      });
    }

    if (htmlKey) {
      const { data, error } = await sb.storage.from(bucket).download(htmlKey);
      if (error) return json(400, { error: "HTML download failed", detail: error.message });
      const b64 = bytesToBase64(new Uint8Array(await data.arrayBuffer()));
      attachments.push({
        filename: p.htmlFilename || htmlKey.split("/").pop() || "report.html",
        content: b64,
        type: "text/html; charset=utf-8",
      });
    }

    // 3) Build Resend payload
    const emailPayload = {
      from: RESEND_FROM,
      to: p.to,
      cc: p.cc,
      bcc: p.bcc,
      subject: p.subject,
      text: p.text ?? "Report attached.",
      html: p.html,                       // TIP: pass "<p>...</p>" not &lt;p&gt;...
      attachments: attachments.length ? attachments : undefined,
      // reply_to: "clivecraig@gmail.com", // optional: where replies go
    };

    // 4) Send via Resend HTTP API
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const txt = await r.text();
    if (!r.ok) {
      // 401 invalid API key; 403 domain not verified; 422 invalid payload, etc.
      return json(502, { error: "Resend failed", status: r.status, resp: txt });
    }

    // Resend returns JSON like { "id": "..." }
    return new Response(txt, { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return json(500, { error: (e as Error).message ?? String(e) });
  }
});