import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebasePhoneToken } from "../_shared/firebase-auth.ts";
import { createCashfreePaymentOrder } from "../_shared/cashfree.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } });

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS") || "";
  if (!url || !key) throw new Error("Payment service is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function tokenHash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "POST required." }, 405);
  try {
    const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!token) return reply({ error: "Please sign in to continue." }, 401);
    const identity = await verifyFirebasePhoneToken(token);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const coinPackId = typeof body.coin_pack_id === "string" ? body.coin_pack_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(coinPackId)) return reply({ error: "Choose an available coin pack." }, 400);
    const admin = adminClient();
    const { data: pack, error: packError } = await admin.from("coin_packs")
      .select("id,coins,price_paise,available_from,available_until").eq("id", coinPackId).eq("active", true).maybeSingle();
    if (packError || !pack) return reply({ error: "This coin pack is no longer available." }, 409);
    const now = Date.now();
    if ((pack.available_from && Date.parse(pack.available_from) > now) || (pack.available_until && Date.parse(pack.available_until) <= now))
      return reply({ error: "This coin pack is not currently available." }, 409);

    const providerOrderId = `atcf_${crypto.randomUUID().replace(/-/g, "")}`;
    const checkoutTokenHash = await tokenHash(crypto.randomUUID());
    const { data: order, error: orderError } = await admin.from("phone_payment_orders").insert({
      phone: identity.phone, coin_pack_id: pack.id, coins: pack.coins, amount_paise: pack.price_paise,
      provider: "cashfree", provider_order_id: providerOrderId, checkout_token_hash: checkoutTokenHash, status: "created",
    }).select("id").single();
    if (orderError || !order) throw orderError || new Error("Could not save the payment order.");
    try {
      const cashfreeOrder = await createCashfreePaymentOrder({
        order_id: providerOrderId, order_amount: pack.price_paise / 100, order_currency: "INR",
        customer_details: { customer_id: `at_${identity.phone.replace(/\D/g, "")}`, customer_phone: identity.phone.replace(/^\+91/, "") },
        order_meta: {
          // Cashfree's built-in NOTIFY_URL webhook policy uses this server-side
          // destination. It is never supplied by the app client.
          notify_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/cashfree-webhook`,
        },
        order_note: `Aasai Talk wallet top-up: ${pack.coins} coins`,
      });
      if (typeof cashfreeOrder.payment_session_id !== "string" || typeof cashfreeOrder.order_id !== "string") throw new Error("Cashfree returned an invalid payment session.");
      return reply({ order_id: providerOrderId, payment_session_id: cashfreeOrder.payment_session_id, amount_paise: pack.price_paise, coins: pack.coins });
    } catch (error) {
      await admin.from("phone_payment_orders").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", order.id);
      throw error;
    }
  } catch (error) {
    console.error("Cashfree order creation failed:", error);
    return reply({ error: error instanceof Error ? error.message : "Cashfree payment could not start." }, 500);
  }
});
