// src/storage/reportOutbox.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { supabase } from "../lib/supabase";
import { uploadReportAndLog } from "./uploadReport";
import { debugLog } from "../debug/DebugLog";

const OUTBOX_KEY = "report_outbox";
let isProcessing = false;

/**
 * IMPORTANT: put your shared header value here OR in an env var.
 * Best practice (Expo): set EXPO_PUBLIC_FN_SHARED_KEY at build time.
 * Quick test: paste the exact same value you set in Supabase secrets (FN_SHARED_KEY).
 */
const APP_FN_SHARED_KEY =
  (process.env.EXPO_PUBLIC_FN_SHARED_KEY as string) ||
  "Q7yfm!8U9f^V2-1p%6xWbZ0j~nH4Jr#L_kRGd2c@X3";

export type OutboxItem = {
  id: string;
  matchId: string;
  subject: string;
  body: string;
  csvUri: string;
  htmlUri: string;
  storageKeyBase?: string;
  created: string;

  serverSend?: boolean;
  to?: string[];
  cc?: string[];
  bcc?: string[];

  openComposer?: boolean;

  // Local guard so we don't re-process the same item concurrently
  processing?: boolean;
};

export async function getOutbox(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch (e) {
    debugLog("[OUTBOX] getOutbox parse error", (e as any)?.message ?? String(e));
    return [];
  }
}

export async function getOutboxRaw(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(OUTBOX_KEY);
  } catch {
    return null;
  }
}

export async function queueReport(item: OutboxItem) {
  const list = await getOutbox();
  list.push(item);
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
  debugLog("[OUTBOX] queued", {
    id: item.id,
    serverSend: item.serverSend,
    to: item.to,
    base: item.storageKeyBase,
  });
}

export async function removeFromOutbox(id: string) {
  const list = await getOutbox();
  const next = list.filter((i) => i.id !== id);
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(next));
  debugLog("[OUTBOX] removed", id);
}

const cleanBase = (base?: string) =>
  (base || "")
    .replace(/^reports\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/+/g, "/");

export async function processOutbox() {
  if (isProcessing) {
    debugLog("[OUTBOX] skip, already processing");
    return;
  }
  isProcessing = true;

  try {
    const net = await NetInfo.fetch();
    debugLog("[OUTBOX] process start, online?", String(net.isConnected));
    if (!net.isConnected) {
      debugLog("[OUTBOX] abort, offline");
      return;
    }

    // Load queue and skip those already marked 'processing'
    let items = await getOutbox();
    items = items.filter((i) => !i.processing);
    // Oldest first (so earlier reports go out first)
    items.sort((a, b) => Date.parse(a.created) - Date.parse(b.created));

    debugLog("[OUTBOX] items", String(items.length));
    if (!items.length) return;

    // Persist 'processing' marks now so a second call in parallel won’t double-handle
    const all = await getOutbox();
    const toMark = new Set(items.map((i) => i.id));
    for (const it of all) if (toMark.has(it.id)) it.processing = true;
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(all));

    for (const item of items) {
      debugLog("[OUTBOX] handling", item.id, JSON.stringify({ serverSend: item.serverSend, to: item.to }));

      try {
        // 1) Build Storage keys (stable base so server’s idempotency marker matches)
        const base = cleanBase(item.storageKeyBase) || `${item.matchId}/${item.id}`;
        const csvKey = `${base}.csv`;
        const htmlKey = `${base}.html`;
        debugLog("[OUTBOX] upload start", JSON.stringify({ csvKey, htmlKey }));

        // 2) Upload CSV + HTML
        await uploadReportAndLog(item.matchId, item.csvUri, csvKey, "text/csv");
        await uploadReportAndLog(item.matchId, item.htmlUri, htmlKey, "text/html");
        debugLog("[OUTBOX] upload done", JSON.stringify({ csvKey, htmlKey }));

        // 3) Invoke Edge Function (server send) — PUBLIC + shared-secret guard
        if (item.serverSend) {
          const to = item.to && item.to.length ? item.to : ["coach@example.com"];
          debugLog("[OUTBOX] invoke function send-report-email", JSON.stringify({ to }));

          const payload = {
            to,
            cc: item.cc,
            bcc: item.bcc,
            subject: item.subject,
            text: item.body,
            html: item.body?.replace(/\n/g, "<br/>"), // real HTML line breaks
            bucket: "reports",
            csvKey,
            htmlKey,
            csvFilename: csvKey.split("/").pop(),
            htmlFilename: htmlKey.split("/").pop(),
          };

          const { data, error } = await supabase.functions.invoke("send-report-email", {
            body: payload,
            headers: { "x-fn-key": APP_FN_SHARED_KEY }, // ← PUBLIC guard (no JWT required)
          });

          if (error) {
            const status = (error as any)?.context?.status ?? "";
            const bodyResp = (error as any)?.context?.body ?? "";
            debugLog("[OUTBOX] function error", `status=${status}`, bodyResp || (error.message ?? JSON.stringify(error)));

            // Undo 'processing' so this item can retry later
            const list = await getOutbox();
            const it = list.find((x) => x.id === item.id);
            if (it) it.processing = false;
            await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(list));

            throw error;
          }
          debugLog("[OUTBOX] function ok", JSON.stringify(data ?? {}));
        }

        // 4) Remove item after success (prevents re-uploads/re-sends)
        await removeFromOutbox(item.id);
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        const code = e?.status ?? e?.error?.status ?? (e?.context?.status ?? "");
        debugLog("[OUTBOX] item failed, will retry later", item.id, `code=${code}`, msg);

        // Undo 'processing' so this item can retry on the next run
        const list = await getOutbox();
        const it = list.find((x) => x.id === item.id);
        if (it) it.processing = false;
        await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
      }
    }
  } catch (e: any) {
    debugLog("[OUTBOX] process error", e?.message ?? String(e));
  } finally {
    isProcessing = false;
    debugLog("[OUTBOX] process end");
  }
}

export async function clearOutboxNow() {
  await AsyncStorage.removeItem(OUTBOX_KEY);
}

// ⭐ NEW — remove queued reports only for a specific match
export async function removeQueuedReportsForMatch(matchId: string) {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    if (!raw) return;

    const arr = JSON.parse(raw);
    // Keep everything except reports for this match
    const filtered = arr.filter((item: any) => item.matchId !== matchId);

    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(filtered));
    debugLog("[OUTBOX] cleared reports for match", matchId);
  } catch (e) {
    debugLog("[OUTBOX] clearByMatch error", String(e));
  }
}