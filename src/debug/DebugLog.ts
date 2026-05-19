// src/debug/DebugLog.ts
let logs: string[] = [];

export function debugLog(...args: any[]) {
  const msg = args
    .map(a => {
      try { return typeof a === 'string' ? a : JSON.stringify(a); }
      catch { return String(a); }
    })
    .join(' ');
  const line = `[${new Date().toISOString()}] ${msg}`;
  logs.push(line);
  if (logs.length > 200) logs = logs.slice(-200);

  // Still helpful in dev sessions (Metro)
  // eslint-disable-next-line no-console
  console.log(line);
}

export function getDebugLogs() {
  return logs.join('\n');
}

export function clearDebugLogs() {
  logs = [];
}