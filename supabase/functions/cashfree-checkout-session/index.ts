import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchCashfreePaymentOrder } from "../_shared/cashfree.ts";
import { checkoutTokenExpired, findCashfreeCheckoutOrder } from "../_shared/cashfree-checkout-token.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } });

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS") || "";
  if (!url || !key) throw new Error("Payment service is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "POST required." }, 405);
  try {
    const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const order = await findCashfreeCheckoutOrder(adminClient(), token);
    if (!order) return reply({ error: "This checkout link is invalid or has expired." }, 404);
    if (checkoutTokenExpired(order.created_at, 30 * 60 * 1000))
      return reply({ error: "This checkout link has expired. Return to Aasai Talk and start a new recharge." }, 410);
    if (order.status !== "created")
      return reply({ error: "This payment is no longer awaiting checkout. Return to Aasai Talk to check its status." }, 409);

    const cashfreeOrder = await fetchCashfreePaymentOrder(order.provider_order_id);
    const amountPaise = Math.round(Number(cashfreeOrder.order_amount) * 100);
    if (cashfreeOrder.order_id !== order.provider_order_id
      || typeof cashfreeOrder.payment_session_id !== "string"
      || amountPaise !== order.amount_paise
      || cashfreeOrder.order_currency !== "INR")
      throw new Error("Cashfree returned an order that does not match this recharge.");
    return reply({
      order_id: order.provider_order_id,
      payment_session_id: cashfreeOrder.payment_session_id,
      amount_paise: order.amount_paise,
      coins: order.coins,
    });
  } catch (error) {
    console.error("Cashfree checkout session failed:", error);
    return reply({ error: error instanceof Error ? error.message : "Cashfree checkout could not be opened." }, 500);
  }
});
