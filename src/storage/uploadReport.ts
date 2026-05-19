// src/storage/uploadReport.ts
import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Upload a local file (URI) to the "reports" bucket.
 * - remoteKey is the PATH INSIDE the bucket (no "reports/" prefix, no trailing "/").
 * - Reads file as Base64 -> Uint8Array (reliable on Expo/React Native).
 * - upsert: true to replace same key every time (friendly filenames).
 */
export async function uploadReportAndLog(
  matchId: string,
  localUri: string,
  remoteKey: string,
  contentType: string
): Promise<string> {
  const BUCKET = 'reports';

  // sanitize the key (inside bucket)
  let key = (remoteKey || '')
    .replace(/^reports\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/+/g, '/');

  if (!key || key.endsWith('/')) {
    throw new Error(`Invalid remoteKey "${remoteKey}". It must not be empty or end with "/".`);
  }

  // quick existence/size sanity (size may not exist on all platforms)
  try {
    const info: any = await FileSystem.getInfoAsync(localUri, { size: true });
    if (!info?.exists) throw new Error(`Local file not found: ${localUri}`);
    if (typeof info.size === 'number' && info.size === 0) {
      throw new Error(`Local file is empty (0 bytes): ${localUri}`);
    }
  } catch {
    // continue; we'll validate after decoding
  }

  // read as Base64, then decode to Uint8Array
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' as any });
  const bytes = base64ToUint8Array(base64);
  if (!bytes || bytes.length === 0) throw new Error(`Could not load bytes from file: ${localUri}`);

  // safe content-type fallback
  const finalType =
    (contentType && String(contentType).trim()) ||
    (key.endsWith('.csv') ? 'text/csv; charset=utf-8'
      : key.endsWith('.html') ? 'text/html; charset=utf-8'
      : 'application/octet-stream');

  // ✅ upload Uint8Array (no Blob)
  const { error } = await supabase
    .storage
    .from(BUCKET)
    .upload(key, bytes, {
      contentType: finalType,
      upsert: true,
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(`Upload failed for "${key}": ${error.message}`);
  }

  // optional audit
  try {
    await supabase.from('report_uploads').insert({
      match_id: matchId,
      key,
      content_type: finalType,
      uploaded_at: new Date().toISOString(),
    });
  } catch { /* ignore */ }

  return key;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output: number[] = [];
  let i = 0;
  base64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  while (i < base64.length) {
    const enc1 = chars.indexOf(base64.charAt(i++));
    const enc2 = chars.indexOf(base64.charAt(i++));
    const enc3 = chars.indexOf(base64.charAt(i++));
    const enc4 = chars.indexOf(base64.charAt(i++));

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    output.push(chr1);
    if (enc3 !== 64) output.push(chr2);
    if (enc4 !== 64) output.push(chr3);
  }
  return new Uint8Array(output);
}