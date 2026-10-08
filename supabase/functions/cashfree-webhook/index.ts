import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCashfreeWebhook } from "../_shared/cashfree.ts";
import { reconcileCashfreeOrder } from "../_shared/cashfree-reconcile.ts";

function adminClient() { const url = Deno.env.get("SUPABASE_URL") || ""; const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS") || ""; if (!url || !key) throw new Error("Payment service is not configured."); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "POST required." }, { status: 405 });
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-webhook-signature") || "";
    const timestamp = request.headers.get("x-webhook-timestamp") || "";
    if (!await verifyCashfreeWebhook(signature, timestamp, rawBody)) return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
    const payload = JSON.parse(rawBody) as { data?: { order?: { order_id?: unknown } } };
    const orderId = payload.data?.order?.order_id;
    if (typeof orderId !== "string" || !/^atcf_[a-f0-9]{32}$/i.test(orderId)) return Response.json({ ok: true }, { status: 200 });
    try {
      await reconcileCashfreeOrder(adminClient(), orderId);
    } catch (error) {
      // Cashfree's dashboard test payload does not represent one of our orders.
      // Acknowledge it after signature verification, but never create or credit
      // an order from webhook-supplied data.
      if (!(error instanceof Error) || error.message !== "Payment order was not found.") throw error;
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Cashfree webhook failed:", error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
});
