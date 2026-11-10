import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reconcileCashfreeOrder } from "../_shared/cashfree-reconcile.ts";
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
    const admin = adminClient();
    const order = await findCashfreeCheckoutOrder(admin, token);
    if (!order) return reply({ error: "This checkout link is invalid or has expired." }, 404);
    if (checkoutTokenExpired(order.created_at, 24 * 60 * 60 * 1000))
      return reply({ error: "This checkout session has expired. Return to Aasai Talk to check your wallet." }, 410);
    return reply(await reconcileCashfreeOrder(admin, order.provider_order_id, order.phone));
  } catch (error) {
    console.error("Cashfree checkout status failed:", error);
    return reply({ error: error instanceof Error ? error.message : "Cashfree payment status could not be checked." }, 500);
  }
});
