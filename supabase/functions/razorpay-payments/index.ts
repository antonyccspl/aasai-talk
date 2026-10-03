import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebasePhoneToken } from "../_shared/firebase-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const indianRupees = "INR";

type PaymentOrder = {
  id: string;
  phone: string;
  coins: number;
  amount_paise: number;
  currency: string;
  provider_order_id: string;
  provider_payment_id: string | null;
  checkout_token_hash: string;
  status: string;
  credited_at: string | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
}

function config() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS");
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!supabaseUrl || !serviceKey || !keyId || !keySecret)
    throw new Error("Payments are not configured yet.");
  return { supabaseUrl, serviceKey, keyId, keySecret };
}

function adminClient() {
  const { supabaseUrl, serviceKey } = config();
  return createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function bearerToken(request: Request) {
  return (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
}

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

function sameValue(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function razorpayAuth() {
  const { keyId, keySecret } = config();
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

async function razorpayRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: { Authorization: razorpayAuth(), "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Payment provider request failed.");
  return body as Record<string, unknown>;
}

async function authenticatedIdentity(request: Request) {
  const token = bearerToken(request);
  if (!token) throw new Error("Please sign in to continue.");
  return verifyFirebasePhoneToken(token);
}

async function orderForPhone(admin: ReturnType<typeof adminClient>, orderId: unknown, phone: string) {
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error("Invalid payment reference.");
  const { data, error } = await admin.from("phone_payment_orders")
    .select("id,phone,coins,amount_paise,currency,provider_order_id,provider_payment_id,checkout_token_hash,status,credited_at")
    .eq("id", orderId).eq("phone", phone).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Payment reference was not found.");
  return data as PaymentOrder;
}

async function creditIfCaptured(admin: ReturnType<typeof adminClient>, order: PaymentOrder) {
  if (order.status !== "captured") return null;
  const { data, error } = await admin.rpc("credit_phone_wallet_payment", { input_payment_order_id: order.id });
  if (error) throw error;
  const result = data as Record<string, unknown> | null;
  return typeof result?.remaining_coins === "number" ? result.remaining_coins : null;
}

async function validateProviderPayment(
  admin: ReturnType<typeof adminClient>,
  order: PaymentOrder,
  paymentId: string,
) {
  const providerPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
  if (
    providerPayment.id !== paymentId || providerPayment.order_id !== order.provider_order_id ||
    providerPayment.amount !== order.amount_paise || providerPayment.currency !== order.currency
  ) throw new Error("Payment details could not be confirmed.");

  const providerStatus = providerPayment.status;
  const status = providerStatus === "captured" ? "captured" : providerStatus === "authorized" ? "authorized" : "failed";
  const { error } = await admin.from("phone_payment_orders").update({
    provider_payment_id: paymentId,
    status,
    provider_payload: providerPayment,
    captured_at: status === "captured" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", order.id).or(`provider_payment_id.is.null,provider_payment_id.eq.${paymentId}`);
  if (error) throw error;
  return { ...order, provider_payment_id: paymentId, status } as PaymentOrder;
}

function completeRedirect(orderId: string, status: string) {
  return `aasai-talk://payment?order_id=${encodeURIComponent(orderId)}&status=${encodeURIComponent(status)}`;
}

function checkoutPage(order: PaymentOrder, keyId: string, token: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aasai Talk payment</title><script src="https://checkout.razorpay.com/v1/checkout.js"></script></head><body><p id="message">Opening secure payment…</p><script>
const complete = new URL(location.href); complete.search = '?action=complete&token=${encodeURIComponent(token)}';
const options = { key: ${JSON.stringify(keyId)}, amount: ${order.amount_paise}, currency: 'INR', name: 'Aasai Talk', description: ${JSON.stringify(`${order.coins} coins`)}, order_id: ${JSON.stringify(order.provider_order_id)}, hidden: { contact: true }, theme: { color: '#e23744' }, handler: async function(response) { try { const r = await fetch(complete.toString(), { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(response) }); const result = await r.json(); location.assign(result.redirect_url); } catch (_) { document.getElementById('message').textContent = 'We could not confirm the payment. Please return to Aasai Talk.'; } }, modal: { ondismiss: function() { location.assign(${JSON.stringify(completeRedirect(order.id, "cancelled"))}); } } };
new Razorpay(options).open();
</script></body></html>`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const action = new URL(request.url).searchParams.get("action") || "";

  try {
    if (action === "checkout" && request.method === "GET") {
      const token = new URL(request.url).searchParams.get("token") || "";
      const admin = adminClient();
      const tokenHash = await sha256(token);
      const { data, error } = await admin.from("phone_payment_orders")
        .select("id,phone,coins,amount_paise,currency,provider_order_id,provider_payment_id,checkout_token_hash,status,credited_at")
        .eq("checkout_token_hash", tokenHash).eq("status", "created").maybeSingle();
      if (error) throw error;
      if (!data) return new Response("This payment link is no longer available.", { status: 410 });
      const { keyId } = config();
      return new Response(checkoutPage(data as PaymentOrder, keyId, token), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    if (action === "complete" && request.method === "POST") {
      const token = new URL(request.url).searchParams.get("token") || "";
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const admin = adminClient();
      const tokenHash = await sha256(token);
      const { data, error } = await admin.from("phone_payment_orders")
        .select("id,phone,coins,amount_paise,currency,provider_order_id,provider_payment_id,checkout_token_hash,status,credited_at")
        .eq("checkout_token_hash", tokenHash).maybeSingle();
      if (error) throw error;
      if (!data) return json({ redirect_url: completeRedirect("", "failed") });
      const order = data as PaymentOrder;
      const paymentId = typeof body.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
      const signature = typeof body.razorpay_signature === "string" ? body.razorpay_signature : "";
      const expected = await hmacSha256(config().keySecret, `${order.provider_order_id}|${paymentId}`);
      if (!paymentId || !sameValue(expected, signature)) return json({ redirect_url: completeRedirect(order.id, "failed") });
      const validated = await validateProviderPayment(admin, order, paymentId);
      if (validated.status === "captured") await creditIfCaptured(admin, validated);
      return json({ redirect_url: completeRedirect(order.id, validated.status) });
    }

    if (action === "webhook" && request.method === "POST") {
      const rawBody = await request.text();
      const signature = request.headers.get("x-razorpay-signature") || "";
      const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
      if (!webhookSecret) throw new Error("Payment webhook is not configured yet.");
      const expected = await hmacSha256(webhookSecret, rawBody);
      if (!sameValue(expected, signature)) return json({ error: "Invalid webhook signature." }, 401);
      const payload = JSON.parse(rawBody) as { event?: string; payload?: { payment?: { entity?: Record<string, unknown> } } };
      const payment = payload.payload?.payment?.entity;
      const paymentId = typeof payment?.id === "string" ? payment.id : "";
      const providerOrderId = typeof payment?.order_id === "string" ? payment.order_id : "";
      if (!paymentId || !providerOrderId) return json({ received: true });
      const admin = adminClient();
      const { data, error } = await admin.from("phone_payment_orders")
        .select("id,phone,coins,amount_paise,currency,provider_order_id,provider_payment_id,checkout_token_hash,status,credited_at")
        .eq("provider_order_id", providerOrderId).maybeSingle();
      if (error) throw error;
      if (!data) return json({ received: true });
      const validated = await validateProviderPayment(admin, data as PaymentOrder, paymentId);
      if (validated.status === "captured") await creditIfCaptured(admin, validated);
      return json({ received: true });
    }

    const identity = await authenticatedIdentity(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const admin = adminClient();

    if (action === "create" && request.method === "POST") {
      const packId = typeof body.pack_id === "string" ? body.pack_id : "";
      if (!/^[0-9a-f-]{36}$/i.test(packId)) return json({ error: "Choose a coin pack." }, 400);
      const { data: pack, error: packError } = await admin.from("coin_packs")
        .select("id,coins,price_paise,available_from,available_until").eq("id", packId).eq("active", true).maybeSingle();
      if (packError) throw packError;
      if (!pack) return json({ error: "This coin pack is not available." }, 400);
      // The client hides scheduled offers outside their campaign window, but the
      // server must enforce the same rule before creating a payable order.
      const startsAt = typeof pack.available_from === "string" ? Date.parse(pack.available_from) : Number.NEGATIVE_INFINITY;
      const endsAt = typeof pack.available_until === "string" ? Date.parse(pack.available_until) : Number.POSITIVE_INFINITY;
      const now = Date.now();
      if (Number.isNaN(startsAt) || Number.isNaN(endsAt) || startsAt > now || now >= endsAt)
        return json({ error: "This coin pack is not currently available." }, 400);
      const { error: identityError } = await admin.rpc("open_phone_identity", { input_phone: identity.phone });
      if (identityError) throw identityError;
      const providerOrder = await razorpayRequest("/orders", {
        method: "POST",
        body: JSON.stringify({ amount: pack.price_paise, currency: indianRupees, receipt: `wallet_${crypto.randomUUID().replaceAll("-", "").slice(0, 28)}`, notes: { product: "aasai_talk_coins", phone: identity.phone } }),
      });
      if (typeof providerOrder.id !== "string" || providerOrder.amount !== pack.price_paise || providerOrder.currency !== indianRupees)
        throw new Error("Payment provider returned an invalid order.");
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      const { data: saved, error: saveError } = await admin.from("phone_payment_orders").insert({
        phone: identity.phone, coin_pack_id: pack.id, coins: pack.coins, amount_paise: pack.price_paise,
        provider_order_id: providerOrder.id, checkout_token_hash: await sha256(token),
      }).select("id").single();
      if (saveError) throw saveError;
      const endpoint = new URL(request.url);
      endpoint.search = `?action=checkout&token=${encodeURIComponent(token)}`;
      const { keyId } = config();
      return json({ order_id: saved.id, provider_order_id: providerOrder.id, key_id: keyId, amount_paise: pack.price_paise, currency: indianRupees, checkout_url: endpoint.toString() });
    }

    if (action === "verify" && request.method === "POST") {
      const order = await orderForPhone(admin, body.order_id, identity.phone);
      const paymentId = typeof body.payment_id === "string" ? body.payment_id : "";
      const signature = typeof body.signature === "string" ? body.signature : "";
      const expected = await hmacSha256(config().keySecret, `${order.provider_order_id}|${paymentId}`);
      if (!paymentId || !sameValue(expected, signature)) return json({ error: "Payment confirmation could not be verified." }, 400);
      const validated = await validateProviderPayment(admin, order, paymentId);
      const remainingCoins = validated.status === "captured" ? await creditIfCaptured(admin, validated) : null;
      return json({ status: validated.status, remaining_coins: remainingCoins });
    }

    if (action === "status" && request.method === "POST") {
      const order = await orderForPhone(admin, body.order_id, identity.phone);
      const remainingCoins = order.status === "captured" ? await creditIfCaptured(admin, order) : null;
      return json({ status: order.status, remaining_coins: remainingCoins });
    }
    return json({ error: "Unsupported payment request." }, 400);
  } catch (error) {
    console.error("Razorpay payment request failed:", error);
    const message = error instanceof Error ? error.message : "Unable to process payment.";
    return json({ error: message }, message === "Please sign in to continue." ? 401 : 500);
  }
});
