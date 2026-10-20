import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebasePhoneToken } from "../_shared/firebase-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PushEvent = "incoming_call" | "message" | "wallet";
type PushPreferences = {
  calls: boolean;
  messages: boolean;
  wallet: boolean;
  announcements: boolean;
};

function parsePreferences(value: unknown): PushPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid notification preferences.");
  const preferences = value as Record<string, unknown>;
  for (const key of ["calls", "messages", "wallet", "announcements"]) {
    if (typeof preferences[key] !== "boolean")
      throw new Error("Choose whether to receive each type of notification.");
  }
  return {
    calls: preferences.calls as boolean,
    messages: preferences.messages as boolean,
    wallet: preferences.wallet as boolean,
    announcements: preferences.announcements as boolean,
  };
}

async function readPreferences(admin: ReturnType<typeof createClient>, phone: string): Promise<PushPreferences> {
  const { data, error } = await admin.from("phone_notification_preferences")
    .select("calls_enabled,messages_enabled,wallet_enabled,announcements_enabled")
    .eq("phone", phone).maybeSingle();
  if (error) throw error;
  return {
    calls: data?.calls_enabled ?? true,
    messages: data?.messages_enabled ?? true,
    wallet: data?.wallet_enabled ?? true,
    announcements: data?.announcements_enabled ?? true,
  };
}

function phoneUserId(phone: string) {
  return `phone_${phone.replace(/\D/g, "")}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return Response.json({ error: "POST required" }, { status: 405, headers: corsHeaders });

  try {
    const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!token)
      return Response.json({ error: "Firebase sign-in is required." }, { status: 401, headers: corsHeaders });
    const identity = await verifyFirebasePhoneToken(token);
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!supabaseUrl || !serviceKey)
      return Response.json({ error: "Push service is not configured." }, { status: 503, headers: corsHeaders });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (action === "register") {
      const pushToken = typeof body.expo_push_token === "string" ? body.expo_push_token : "";
      const platform = body.platform;
      const requestedPreferences = parsePreferences(body.preferences);
      if (!/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(pushToken) || (platform !== "android" && platform !== "ios"))
        return Response.json({ error: "Invalid push device." }, { status: 400, headers: corsHeaders });
      const { error: identityError } = await admin.rpc("open_phone_identity", { input_phone: identity.phone });
      if (identityError) throw identityError;
      const { data: existingPreferences, error: preferencesError } = await admin
        .from("phone_notification_preferences")
        .select("phone")
        .eq("phone", identity.phone)
        .maybeSingle();
      if (preferencesError) throw preferencesError;
      if (!existingPreferences) {
        const { error: insertPreferencesError } = await admin.from("phone_notification_preferences").upsert({
          phone: identity.phone,
          calls_enabled: requestedPreferences.calls,
          messages_enabled: requestedPreferences.messages,
          wallet_enabled: requestedPreferences.wallet,
          announcements_enabled: requestedPreferences.announcements,
        }, { onConflict: "phone", ignoreDuplicates: true });
        if (insertPreferencesError) throw insertPreferencesError;
      }
      const preferences = await readPreferences(admin, identity.phone);
      const { error } = await admin.from("phone_push_tokens").upsert({
        expo_push_token: pushToken,
        phone: identity.phone,
        platform,
        calls_enabled: preferences.calls,
        messages_enabled: preferences.messages,
        wallet_enabled: preferences.wallet,
        updated_at: new Date().toISOString(),
      }, { onConflict: "expo_push_token" });
      if (error) throw error;
      return Response.json({ registered: true }, { headers: corsHeaders });
    }

    if (action === "unregister") {
      const pushToken = typeof body.expo_push_token === "string" ? body.expo_push_token : "";
      const { error } = await admin.from("phone_push_tokens").delete()
        .eq("phone", identity.phone).eq("expo_push_token", pushToken);
      if (error) throw error;
      return Response.json({ unregistered: true }, { headers: corsHeaders });
    }

    if (action === "preferences") {
      const preferences = parsePreferences(body.preferences);
      const updatedAt = new Date().toISOString();
      const { error: preferenceError } = await admin.from("phone_notification_preferences").upsert({
        phone: identity.phone,
        calls_enabled: preferences.calls,
        messages_enabled: preferences.messages,
        wallet_enabled: preferences.wallet,
        announcements_enabled: preferences.announcements,
        updated_at: updatedAt,
      }, { onConflict: "phone" });
      if (preferenceError) throw preferenceError;
      return Response.json({ updated: true }, { headers: corsHeaders });
    }

    if (action === "get_preferences") {
      return Response.json({
        preferences: await readPreferences(admin, identity.phone),
      }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
    }

    if (action !== "send")
      return Response.json({ error: "Unsupported push action." }, { status: 400, headers: corsHeaders });

    const event = body.event as PushEvent;
    const eventId = typeof body.event_id === "string" ? body.event_id : "";
    if (!eventId || !["incoming_call", "message", "wallet"].includes(event))
      return Response.json({ error: "Invalid push event." }, { status: 400, headers: corsHeaders });

    let recipientPhone = identity.phone;
    let eventKey = `${event}:${eventId}`;
    let route = "/wallet/transactions";
    let title = "Wallet activity";
    let message = "Your wallet activity has been updated.";
    let channelId = "messages";
    let priority = "default";
    let ttl = 3600;
    let incomingCallPayload: Record<string, string> | null = null;
    let presenceAcceptingCalls = false;

    if (event === "incoming_call") {
      const { data, error } = await admin.from("call_sessions")
        .select("id,caller_phone,host_phone,call_type,status")
        .eq("id", eventId).maybeSingle();
      if (error) throw error;
      if (!data || data.caller_phone !== identity.phone || data.status !== "ringing")
        return Response.json({ error: "Incoming call is not authorized." }, { status: 403, headers: corsHeaders });
      recipientPhone = data.host_phone;
      const { data: presence, error: presenceError } = await admin
        .from("phone_host_presence")
        .select("accepting_calls")
        .eq("host_phone", data.host_phone)
        .maybeSingle();
      if (presenceError) throw presenceError;
      presenceAcceptingCalls = presence?.accepting_calls === true;
      const { data: caller } = await admin.from("phone_profiles").select("display_name,username")
        .eq("phone", identity.phone).maybeSingle();
      const callerName = typeof caller?.display_name === "string" && caller.display_name.trim()
        ? caller.display_name.trim()
        : typeof caller?.username === "string" && caller.username
          ? `@${caller.username}`
          : "Aasai Talk member";
      title = "Incoming call";
      message = `${callerName} is calling you.`;
      channelId = "calls";
      priority = "high";
      ttl = 45;
      route = `/calls/incoming/${phoneUserId(identity.phone)}?type=${data.call_type}&session=${data.id}&name=${encodeURIComponent(callerName)}`;
      incomingCallPayload = {
        route,
        type: event,
        eventId: data.id,
        sessionId: data.id,
        callType: data.call_type,
        callerPhone: identity.phone,
        callerName,
        hostPhone: data.host_phone,
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      };
    } else if (event === "message") {
      const { data, error } = await admin.from("phone_messages")
        .select("id,sender_phone,recipient_phone")
        .eq("id", eventId).maybeSingle();
      if (error) throw error;
      if (!data || data.sender_phone !== identity.phone)
        return Response.json({ error: "Message notification is not authorized." }, { status: 403, headers: corsHeaders });
      recipientPhone = data.recipient_phone;
      title = "New message";
      message = "You have a new message.";
      route = `/chat/${phoneUserId(identity.phone)}`;
      eventKey = `message:${eventId}`;
    } else {
      const source = body.source;
      let authorized = false;
      if (source === "call") {
        const [{ data: call, error: callError }, { data: charge, error: chargeError }] = await Promise.all([
          admin.from("call_sessions").select("id,caller_phone").eq("id", eventId).maybeSingle(),
          admin.from("phone_call_minute_ledger").select("id").eq("call_session_id", eventId).eq("phone", identity.phone).limit(1),
        ]);
        if (callError) throw callError;
        if (chargeError) throw chargeError;
        authorized = call?.caller_phone === identity.phone && Boolean(charge?.length);
      } else if (source === "message") {
        const [{ data: messageRow, error: messageError }, { data: charge, error: chargeError }] = await Promise.all([
          admin.from("phone_messages").select("id,sender_phone").eq("id", eventId).maybeSingle(),
          admin.from("phone_message_wallet_ledger").select("id").eq("message_id", eventId).eq("phone", identity.phone).maybeSingle(),
        ]);
        if (messageError) throw messageError;
        if (chargeError) throw chargeError;
        authorized = messageRow?.sender_phone === identity.phone && Boolean(charge);
      }
      if (!authorized)
        return Response.json({ error: "Wallet event is not authorized." }, { status: 403, headers: corsHeaders });
      title = "Wallet activity";
      message = "Coins were used for an Aasai Talk service.";
    }

    const preferences = await readPreferences(admin, recipientPhone);
    const enabledForAccount = event === "incoming_call"
      ? preferences.calls
      : event === "message"
        ? preferences.messages
        : preferences.wallet;
    if (!enabledForAccount)
      return Response.json({ sent: 0 }, { headers: corsHeaders });

    const { data: devices, error: deviceError } = await admin.from("phone_push_tokens")
      .select("expo_push_token,platform")
      .eq("phone", recipientPhone);
    if (deviceError) throw deviceError;
    const eligibleDevices = (devices ?? []).filter((device) => {
      if (event === "incoming_call")
        return device.platform === "android"
          ? presenceAcceptingCalls
          : true;
      return true;
    });
    if (!eligibleDevices.length) return Response.json({ sent: 0 }, { headers: corsHeaders });

    const { data: prior, error: priorError } = await admin.from("phone_push_deliveries")
      .select("event_key").eq("event_key", eventKey).eq("recipient_phone", recipientPhone).maybeSingle();
    if (priorError) throw priorError;
    if (prior) return Response.json({ sent: 0, duplicate: true }, { headers: corsHeaders });

    const { error: reserveError } = await admin.from("phone_push_deliveries").insert({
      event_key: eventKey,
      recipient_phone: recipientPhone,
    });
    if (reserveError?.code === "23505")
      return Response.json({ sent: 0, duplicate: true }, { headers: corsHeaders });
    if (reserveError) throw reserveError;

    const results = await Promise.all(eligibleDevices.map(async ({ expo_push_token, platform }) => {
      const androidIncomingCall = event === "incoming_call" && platform === "android";
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(androidIncomingCall ? {
          to: expo_push_token,
          data: incomingCallPayload,
          priority,
          ttl: 30,
        } : {
          to: expo_push_token,
          title,
          body: message,
          sound: "default",
          priority,
          ttl,
          channelId,
          data: { route, type: event, eventId },
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.data?.status === "error") {
        if (result?.data?.details?.error === "DeviceNotRegistered")
          await admin.from("phone_push_tokens").delete().eq("expo_push_token", expo_push_token);
        return false;
      }
      return true;
    }));
    const sent = results.filter(Boolean).length;
    if (!sent) {
      await admin.from("phone_push_deliveries").delete()
        .eq("event_key", eventKey).eq("recipient_phone", recipientPhone);
      throw new Error("Push provider did not accept the notification.");
    }
    return Response.json({ sent }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Push notification request failed:", error);
    return Response.json({ error: "Unable to process the push notification." }, { status: 500, headers: corsHeaders });
  }
});