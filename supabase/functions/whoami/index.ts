// supabase/functions/whoami/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((req) => {
  const auth   = req.headers.get("authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? "";
  return new Response(JSON.stringify({
    ok: true,
    sawAuthorization: auth.length > 0,
    authPrefix: auth.slice(0, 20),
    authLen: auth.length,
    sawApikey: apikey.length > 0,
    apikeyPrefix: apikey.slice(0, 20),
    apikeyLen: apikey.length,
  }, null, 2), { status: 200, headers: { "content-type": "application/json" }});
});
