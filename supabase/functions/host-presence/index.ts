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

    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "heartbeat";

    if (action === "heartbeat") {
      const { error: presenceError } = await admin.rpc(
        "record_phone_host_heartbeat",
        { input_host_phone: identity.phone },
      );
      if (presenceError) throw presenceError;
      return Response.json({ ok: true }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
    }

    if (action === "settings") {
      const { data: settings, error } = await admin
        .from("phone_host_presence")
        .select("accepting_calls,show_last_seen")
        .eq("host_phone", identity.phone)
        .maybeSingle();
      if (error) throw error;
      return Response.json({
        accepting_calls: settings?.accepting_calls ?? false,
        show_last_seen: settings?.show_last_seen ?? true,
      }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
    }

    if (action === "availability") {
      if (typeof body.accepting_calls !== "boolean")
        return Response.json({ error: "Invalid call availability setting." }, { status: 400, headers: corsHeaders });
      if (body.accepting_calls) {
        const { data: androidDevices, error } = await admin
          .from("phone_push_tokens")
          .select("expo_push_token")
          .eq("phone", identity.phone)
          .eq("platform", "android");
        if (error) throw error;
        if (!androidDevices?.length)
          return Response.json({ error: "Enable Android call notifications on this device before accepting calls while away." }, { status: 409, headers: corsHeaders });
      }
      const { error } = await admin.rpc("set_phone_host_call_availability", {
        input_host_phone: identity.phone,
        input_accepting_calls: body.accepting_calls,
      });
      if (error) throw error;
      return Response.json({ ok: true }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
    }

    if (action === "privacy") {
      if (typeof body.show_last_seen !== "boolean")
        return Response.json({ error: "Invalid last-seen privacy setting." }, { status: 400, headers: corsHeaders });
      const { data: updated, error } = await admin
        .from("phone_host_presence")
        .update({ show_last_seen: body.show_last_seen })
        .eq("host_phone", identity.phone)
        .select("host_phone")
        .maybeSingle();
      if (error) throw error;
      if (!updated) {
        const { error: insertError } = await admin.from("phone_host_presence").insert({
          host_phone: identity.phone,
          show_last_seen: body.show_last_seen,
          last_seen_at: new Date(0).toISOString(),
        });
        if (insertError?.code === "23505") {
          const { error: retryError } = await admin
            .from("phone_host_presence")
            .update({ show_last_seen: body.show_last_seen })
            .eq("host_phone", identity.phone);
          if (retryError) throw retryError;
        } else if (insertError) throw insertError;
      }
      return Response.json({ ok: true }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
    }

    return Response.json({ error: "Unsupported presence action." }, { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error("Host presence update failed:", error);
    return Response.json({ error: "Unable to update Host presence." }, { status: 500, headers: corsHeaders });
  }
});