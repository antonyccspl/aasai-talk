import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "web-push";
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
type WebPushSubscription = {
  endpoint: string;
  keys: { auth: string; p256dh: string };
};

function getWebPushConfig() {
  const publicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") || "";
  const subject = Deno.env.get("WEB_PUSH_SUBJECT") || "";
  if (
    !/^[A-Za-z0-9_-]{80,100}$/.test(publicKey)
    || !/^[A-Za-z0-9_-]{40,50}$/.test(privateKey)
    || !subject
  )
    throw new Error("Browser call alerts are not configured correctly.");
  return { publicKey, privateKey, subject };
}

function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      && (
        host === "fcm.googleapis.com"
        || host === "web.push.apple.com"
        || host.endsWith(".push.apple.com")
        || host.endsWith(".push.services.mozilla.com")
        || host.endsWith(".notify.windows.com")
      );
  } catch {
    return false;
  }
}

function parseWebPushSubscription(value: unknown): WebPushSubscription {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid browser notification subscription.");
  const subscription = value as Record<string, unknown>;
  const keys = subscription.keys;
  if (
    !isAllowedPushEndpoint(subscription.endpoint)
    || !keys
    || typeof keys !== "object"
    || !("auth" in keys)
    || !("p256dh" in keys)
    || typeof keys.auth !== "string"
    || typeof keys.p256dh !== "string"
    || !/^[A-Za-z0-9_-]{16,64}$/.test(keys.auth)
    || !/^[A-Za-z0-9_-]{80,120}$/.test(keys.p256dh)
  )
    throw new Error("Invalid browser notification subscription.");
  return {
    endpoint: subscription.endpoint,
    keys: { auth: keys.auth, p256dh: keys.p256dh },
  };
}

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

async function readPreferences(
  read: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<PushPreferences> {
  const { data, error } = await read();
  if (error) throw error;
  if (data !== null) {
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("Notification preferences have an invalid format.");
    const row = data as Record<string, unknown>;
    if (
      typeof row.calls_enabled !== "boolean"
      || typeof row.messages_enabled !== "boolean"
      || typeof row.wallet_enabled !== "boolean"
      || typeof row.announcements_enabled !== "boolean"
    )
      throw new Error("Notification preferences are incomplete.");
    return {
      calls: row.calls_enabled,
      messages: row.messages_enabled,
      wallet: row.wallet_enabled,
      announcements: row.announcements_enabled,
    };
  }
  return {
    calls: true,
    messages: true,
    wallet: true,
    announcements: true,
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

    if (action === "web_vapid_key") {
      return Response.json({ public_key: getWebPushConfig().publicKey }, {
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }

    if (action === "register_web") {
      const subscription = parseWebPushSubscription(body.subscription);
      const { error: identityError } = await admin.rpc("open_phone_identity", { input_phone: identity.phone });
      if (identityError) throw identityError;
      const { data: existing, error: existingError } = await admin
        .from("phone_web_push_subscriptions")
        .select("phone")
        .eq("endpoint", subscription.endpoint)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing && existing.phone !== identity.phone)
        return Response.json({ error: "This browser notification subscription belongs to another account." }, { status: 409, headers: corsHeaders });
      const { error } = await admin.from("phone_web_push_subscriptions").upsert({
        endpoint: subscription.endpoint,
        phone: identity.phone,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });
      if (error) throw error;
      return Response.json({ registered: true }, { headers: corsHeaders });
    }

    if (action === "unregister_web") {
      const endpoint = body.endpoint;
      if (!isAllowedPushEndpoint(endpoint))
        return Response.json({ error: "Invalid browser notification subscription." }, { status: 400, headers: corsHeaders });
      const { error } = await admin.from("phone_web_push_subscriptions")
        .delete().eq("phone", identity.phone).eq("endpoint", endpoint);
      if (error) throw error;
      return Response.json({ unregistered: true }, { headers: corsHeaders });
    }

    if (action === "test_web") {
      const { data: subscriptions, error } = await admin.from("phone_web_push_subscriptions")
        .select("endpoint,p256dh,auth").eq("phone", identity.phone);
      if (error) throw error;
      if (!subscriptions?.length)
        return Response.json({
          error: "This browser is not registered for call alerts. Enable browser call alerts on this device first.",
        }, { status: 409, headers: corsHeaders });

      const { publicKey, privateKey, subject } = getWebPushConfig();
      const payload = JSON.stringify({
        type: "test_call",
        title: "Aasai Talk test alert",
        body: "Browser call alerts are working on this device.",
        route: "/calls",
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      });
      const results = await Promise.allSettled(subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { auth: subscription.auth, p256dh: subscription.p256dh },
          }, payload, {
            TTL: 120,
            urgency: "high",
            vapidDetails: { subject, publicKey, privateKey },
          });
          return true;
        } catch (pushError) {
          if (
            pushError
            && typeof pushError === "object"
            && "statusCode" in pushError
            && (pushError.statusCode === 410 || pushError.statusCode === 404)
          ) {
            const { error: deleteError } = await admin.from("phone_web_push_subscriptions")
              .delete().eq("endpoint", subscription.endpoint);
            if (deleteError) throw deleteError;
            return false;
          }
          throw pushError;
        }
      }));
      const accepted = results.some((result) =>
        result.status === "fulfilled" && result.value
      );
      if (!accepted) {
        for (const result of results) {
          if (result.status === "rejected")
            console.error("Browser test alert delivery failed:", result.reason);
        }
        return Response.json({
          error: results.some((result) =>
            result.status === "fulfilled" && !result.value
          )
            ? "The browser push subscription has expired. Enable browser call alerts again on this device."
            : "The browser test alert could not be delivered. Check the browser notification settings and try again.",
        }, { status: 502, headers: corsHeaders });
      }
      return Response.json({ sent: true }, { headers: corsHeaders });
    }

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
      const preferences = await readPreferences(() => admin.from("phone_notification_preferences")
        .select("calls_enabled,messages_enabled,wallet_enabled,announcements_enabled")
        .eq("phone", identity.phone).maybeSingle());
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
        preferences: await readPreferences(() => admin.from("phone_notification_preferences")
          .select("calls_enabled,messages_enabled,wallet_enabled,announcements_enabled")
          .eq("phone", identity.phone).maybeSingle()),
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
        .select("id,caller_phone,host_phone,call_type,status,created_at")
        .eq("id", eventId).maybeSingle();
      if (error) throw error;
      if (!data || data.caller_phone !== identity.phone || data.status !== "ringing" || Date.parse(data.created_at) <= Date.now() - 60000)
        return Response.json({ error: "Incoming call is not authorized." }, { status: 403, headers: corsHeaders });
      recipientPhone = data.host_phone;
      const { data: online, error: onlineError } = await admin.rpc("phone_host_is_online", { input_host_phone: recipientPhone });
      if (onlineError) throw onlineError;
      if (!online) {
        await admin.from("call_sessions").update({ status: "missed", ended_at: new Date().toISOString() }).eq("id", eventId).eq("status", "ringing");
        return Response.json({ error: "Host is offline." }, { status: 409, headers: corsHeaders });
      }
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
        expiresAt: new Date(Date.parse(data.created_at) + 60_000).toISOString(),
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

    const markUnreachable = async () => {
      if (event !== "incoming_call") return;
      const { error } = await admin.from("call_sessions")
        .update({ status: "missed", ended_at: new Date().toISOString() })
        .eq("id", eventId).eq("status", "ringing");
      if (error) throw error;
    };
    const preferences = await readPreferences(() => admin.from("phone_notification_preferences")
      .select("calls_enabled,messages_enabled,wallet_enabled,announcements_enabled")
      .eq("phone", recipientPhone).maybeSingle());
    const enabledForAccount = event === "incoming_call"
      ? preferences.calls || presenceAcceptingCalls
      : event === "message"
        ? preferences.messages
        : preferences.wallet;
    if (!enabledForAccount) {
      await markUnreachable();
      return Response.json({ sent: 0 }, { headers: corsHeaders });
    }

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
    let webSubscriptions: Array<{
      endpoint: string;
      p256dh: string;
      auth: string;
    }> = [];
    if (event === "incoming_call") {
      const { data, error } = await admin.from("phone_web_push_subscriptions")
        .select("endpoint,p256dh,auth").eq("phone", recipientPhone);
      if (error) throw error;
      webSubscriptions = data ?? [];
    }
    if (!eligibleDevices.length && !webSubscriptions.length) {
      await markUnreachable();
      return Response.json({ sent: 0 }, { headers: corsHeaders });
    }

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

    const nativeResults = eligibleDevices.map(async ({ expo_push_token, platform }) => {
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
    });
    const webResults = webSubscriptions.map(async (subscription) => {
      try {
        const { publicKey, privateKey, subject } = getWebPushConfig();
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { auth: subscription.auth, p256dh: subscription.p256dh },
        }, JSON.stringify({
          type: "incoming_call",
          callId: eventId,
          title: "Incoming call",
          body: message,
          route: incomingCallPayload?.route,
          expiresAt: incomingCallPayload?.expiresAt,
        }), {
          TTL: 30,
          urgency: "high",
          topic: eventId.replace(/-/g, "").slice(0, 32),
          vapidDetails: { subject, publicKey, privateKey },
        });
        return true;
      } catch (error) {
        if (
          error
          && typeof error === "object"
          && "statusCode" in error
          && (error.statusCode === 410 || error.statusCode === 404)
        ) {
          const { error: deleteError } = await admin.from("phone_web_push_subscriptions")
            .delete().eq("endpoint", subscription.endpoint);
          if (deleteError) console.error("Unable to remove expired browser push subscription:", deleteError);
          return false;
        }
        console.error("Browser call alert delivery failed:", error);
        return false;
      }
    });
    const results = await Promise.allSettled([...nativeResults, ...webResults]);
    const sent = results.filter((result) => result.status === "fulfilled" && result.value).length;
    if (!sent) {
      if (event === "incoming_call") {
        const { error } = await admin.from("call_sessions").update({ status: "missed", ended_at: new Date().toISOString() }).eq("id", eventId).eq("status", "ringing");
        if (error) throw error;
      }
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