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
    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "heartbeat";

    if (action === "heartbeat" || action === "member-heartbeat") {
      const { data: profile, error: profileError } = await admin
        .from("phone_profiles")
        .select("gender")
        .eq("phone", identity.phone)
        .maybeSingle();
      if (profileError) throw profileError;
      if (profile?.gender === "Male") {
        const { data: lastSeenAt, error: presenceError } = await admin.rpc(
          "record_phone_member_heartbeat",
          { input_member_phone: identity.phone },
        );
        if (presenceError) throw presenceError;
        return Response.json({
          ok: true,
          tracked: true,
          member_type: "male_user",
          last_seen_at: lastSeenAt,
        }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
      }
      if (profile?.gender === "Female") {
        const { data: host, error: hostError } = await admin
          .from("host_applications")
          .select("phone")
          .eq("phone", identity.phone)
          .eq("status", "approved")
          .maybeSingle();
        if (hostError) throw hostError;
        if (!host)
          return Response.json({
            ok: true,
            tracked: false,
            member_type: "female_member",
          }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
        const { error: presenceError } = await admin.rpc(
          "record_phone_host_heartbeat",
          { input_host_phone: identity.phone },
        );
        if (presenceError) throw presenceError;
        const { data: presence, error: readError } = await admin
          .from("phone_host_presence")
          .select("last_seen_at")
          .eq("host_phone", identity.phone)
          .single();
        if (readError) throw readError;
        return Response.json({
          ok: true,
          tracked: true,
          member_type: "host",
          last_seen_at: presence.last_seen_at,
        }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
      }
      if (!profile)
        return Response.json({ error: "Complete your profile before online status can be tracked." }, { status: 409, headers: corsHeaders });
      return Response.json({ error: "This account cannot be tracked as an online Host or male member." }, { status: 409, headers: corsHeaders });
    }

    const { data: host, error: hostError } = await admin
      .from("host_applications")
      .select("phone,application_profile")
      .eq("phone", identity.phone)
      .eq("status", "approved")
      .maybeSingle();
    if (hostError) throw hostError;
    if (!host)
      return Response.json({ error: "An approved Host account is required." }, { status: 403, headers: corsHeaders });

    if (action === "settings") {
      const { data: settings, error } = await admin
        .from("phone_host_presence")
        .select("accepting_calls,show_last_seen,accepting_audio_calls,accepting_video_calls")
        .eq("host_phone", identity.phone)
        .maybeSingle();
      if (error) throw error;
      const applicationProfile =
        host.application_profile &&
        typeof host.application_profile === "object" &&
        !Array.isArray(host.application_profile)
          ? host.application_profile as Record<string, unknown>
          : {};
      return Response.json({
        accepting_calls: settings?.accepting_calls ?? false,
        show_last_seen: settings?.show_last_seen ?? true,
        accepting_audio_calls: settings?.accepting_audio_calls ?? true,
        accepting_video_calls: settings?.accepting_video_calls ?? true,
        audio_capable:
          applicationProfile.audio === true || applicationProfile.audio === "true",
        video_capable:
          applicationProfile.video === true || applicationProfile.video === "true",
      }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
    }

    if (action === "call-preference") {
      if (
        (body.call_type !== "audio" && body.call_type !== "video") ||
        typeof body.accepting !== "boolean"
      )
        return Response.json({ error: "Invalid call preference." }, { status: 400, headers: corsHeaders });
      const { error } = await admin.rpc("set_phone_host_call_preference", {
        input_host_phone: identity.phone,
        input_call_type: body.call_type,
        input_accepting: body.accepting,
      });
      if (error) throw error;
      return Response.json({ ok: true }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
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