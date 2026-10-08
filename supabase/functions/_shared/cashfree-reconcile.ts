import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchCashfreeOrderPayments } from "./cashfree.ts";

export async function reconcileCashfreeOrder(admin: SupabaseClient, providerOrderId: string, expectedPhone?: string) {
  const { data: order, error } = await admin.from("phone_payment_orders")
    .select("id,phone,amount_paise,currency,status,credited_at,provider_payment_id").eq("provider", "cashfree").eq("provider_order_id", providerOrderId).maybeSingle();
  if (error) throw error;
  if (!order || (expectedPhone && order.phone !== expectedPhone)) throw new Error("Payment order was not found.");
  const payments = await fetchCashfreeOrderPayments(providerOrderId);
  const paid = payments.find((payment) => payment.payment_status === "SUCCESS" && Number(payment.payment_amount) * 100 === order.amount_paise && payment.payment_currency === order.currency && payment.cf_payment_id != null);
  if (!paid) {
    const terminalFailure = payments.some((payment) => ["FAILED", "USER_DROPPED"].includes(String(payment.payment_status)));
    if (terminalFailure && order.status !== "captured") await admin.from("phone_payment_orders").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", order.id);
    return { status: terminalFailure ? "failed" : "pending", credited: Boolean(order.credited_at) };
  }
  const paymentId = String(paid.cf_payment_id);
  const { error: updateError } = await admin.from("phone_payment_orders").update({ status: "captured", provider_payment_id: paymentId, captured_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", order.id);
  if (updateError) throw updateError;
  const { data: credit, error: creditError } = await admin.rpc("credit_phone_wallet_payment", { input_payment_order_id: order.id });
  if (creditError) throw creditError;
  return { status: "paid", credited: Boolean(credit && typeof credit === "object" && "credited" in credit && credit.credited), coins: credit && typeof credit === "object" && "coins_credited" in credit ? Number(credit.coins_credited) : undefined };
}
