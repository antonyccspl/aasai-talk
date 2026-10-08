import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebasePhoneToken } from "../_shared/firebase-auth.ts";
import { reconcileCashfreeOrder } from "../_shared/cashfree-reconcile.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
function adminClient() { const url = Deno.env.get("SUPABASE_URL") || ""; const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS") || ""; if (!url || !key) throw new Error("Payment service is not configured."); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "POST required." }, 405);
  try {
    const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!token) return reply({ error: "Please sign in to continue." }, 401);
    const identity = await verifyFirebasePhoneToken(token);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const orderId = typeof body.order_id === "string" ? body.order_id : "";
    if (!/^atcf_[a-f0-9]{32}$/i.test(orderId)) return reply({ error: "Invalid payment order." }, 400);
    return reply(await reconcileCashfreeOrder(adminClient(), orderId, identity.phone));
  } catch (error) {
    console.error("Cashfree payment status failed:", error);
    return reply({ error: error instanceof Error ? error.message : "Cashfree payment status could not be checked." }, 500);
  }
});
