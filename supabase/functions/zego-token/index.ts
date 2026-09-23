import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function randomString(length: number) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function int64Bytes(value: number) {
  const bytes = new Uint8Array(8);
  let current = BigInt(value);
  for (let index = 7; index >= 0; index--) {
    bytes[index] = Number(current & 255n);
    current >>= 8n;
  }
  return bytes;
}

function uint16Bytes(value: number) {
  return new Uint8Array([(value >> 8) & 255, value & 255]);
}

function zegoUserId(phone: string) {
  return `u_${phone.replace(/\D/g, "")}`;
}

function concat(...arrays: Uint8Array[]) {
  const result = new Uint8Array(arrays.reduce((total, array) => total + array.length, 0));
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

function decodeServerSecret(value: string) {
  // Token04 uses the raw 32-byte ServerSecret. App Sign values are commonly
  // supplied as a 64-character hexadecimal representation of those bytes.
  const normalized = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
    const bytes = new Uint8Array(32);
    for (let index = 0; index < bytes.length; index++)
      bytes[index] = parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
    return bytes;
  }
  const bytes = new TextEncoder().encode(normalized);
  return bytes.length === 32 ? bytes : null;
}

async function generateToken04(
  appId: number,
  userId: string,
  serverSecret: Uint8Array,
  roomId: string,
) {
  if (!Number.isSafeInteger(appId) || appId <= 0 || serverSecret.length !== 32)
    throw new Error("Invalid ZEGOCLOUD credentials.");
  const now = Math.floor(Date.now() / 1000);
  const expire = now + 3600;
  const payload = JSON.stringify({
    room_id: roomId,
    privilege: { "1": 1, "2": 1 },
    stream_id_list: null,
  });
  const info = JSON.stringify({
    app_id: appId,
    user_id: userId,
    nonce: Math.floor(Math.random() * 2147483647),
    ctime: now,
    expire,
    payload,
  });
  const iv = new TextEncoder().encode(randomString(16));
  const key = await crypto.subtle.importKey(
    "raw",
    serverSecret,
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, new TextEncoder().encode(info)),
  );
  const binary = concat(
    int64Bytes(expire),
    uint16Bytes(iv.length),
    iv,
    uint16Bytes(encrypted.length),
    encrypted,
  );
  return `04${bytesToBase64(binary)}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return Response.json({ error: "POST required" }, { status: 405, headers: corsHeaders });
  try {
    const body = await request.json();
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    const phone = typeof body.phone === "string" ? body.phone : "";
    if (!sessionId || !/^\+91\d{10}$/.test(phone))
      return Response.json({ error: "Invalid call identity." }, { status: 400, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SECRET_KEYS") ||
      "";
    if (!serviceKey) throw new Error("Supabase server key is not configured.");
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: session, error: sessionError } = await admin
      .from("call_sessions")
      .select("id,caller_phone,host_phone,room_id,status")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) throw new Error("Could not validate call session.");
    if (!session || (session.caller_phone !== phone && session.host_phone !== phone))
      return Response.json({ error: "Call session is not authorized." }, { status: 403, headers: corsHeaders });
    if (session.status !== "connected")
      return Response.json({ error: "Call session is no longer active." }, { status: 409, headers: corsHeaders });

    const userId = zegoUserId(phone);
    const serverSecret = decodeServerSecret(
      Deno.env.get("ZEGO_SERVER_SECRET") ||
      Deno.env.get("ZEGO_APP_SIGN") ||
      "",
    );
    if (!serverSecret)
      return Response.json({ error: "Call service configuration is incomplete. Please contact support." }, { status: 503, headers: corsHeaders });
    const token = await generateToken04(
      Number(Deno.env.get("ZEGO_APP_ID")),
      userId,
      serverSecret,
      session.room_id,
    );
    return Response.json(
      { app_id: Number(Deno.env.get("ZEGO_APP_ID")), user_id: userId, room_id: session.room_id, token, expires_at: Math.floor(Date.now() / 1000) + 3600 },
      { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("ZEGOCLOUD token error:", error);
    return Response.json({ error: "Unable to create a call token." }, { status: 500, headers: corsHeaders });
  }
});
