import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebasePhoneToken } from "../_shared/firebase-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return Response.json({ error: "POST required" }, { status: 405, headers: corsHeaders });

  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!token)
      return Response.json({ error: "Firebase sign-in is required." }, { status: 401, headers: corsHeaders });
    const identity = await verifyFirebasePhoneToken(token);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!supabaseUrl || !serviceKey)
      return Response.json({ error: "Presence service is not configured." }, { status: 503, headers: corsHeaders });

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: host, error: hostError } = await admin
      .from("host_applications")
      .select("phone")
      .eq("phone", identity.phone)
      .eq("status", "approved")
      .maybeSingle();
    if (hostError) throw hostError;
    if (!host)
      return Response.json({ error: "An approved Host account is required." }, { status: 403, headers: corsHeaders });

    const { error: presenceError } = await admin
      .from("phone_host_presence")
      .upsert({ host_phone: identity.phone, last_seen_at: new Date().toISOString() });
    if (presenceError) throw presenceError;
    return Response.json({ ok: true }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Host presence heartbeat failed:", error);
    return Response.json({ error: "Unable to update Host presence." }, { status: 500, headers: corsHeaders });
  }
});