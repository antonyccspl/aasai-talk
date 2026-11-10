import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CashfreeCheckoutOrder = {
  id: string;
  phone: string;
  coins: number;
  amount_paise: number;
  provider_order_id: string;
  status: string;
  created_at: string;
};

export async function hashCashfreeCheckoutToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function findCashfreeCheckoutOrder(admin: SupabaseClient, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data, error } = await admin.from("phone_payment_orders")
    .select("id,phone,coins,amount_paise,provider_order_id,status,created_at")
    .eq("provider", "cashfree")
    .eq("checkout_token_hash", await hashCashfreeCheckoutToken(token))
    .maybeSingle();
  if (error) throw error;
  return data as CashfreeCheckoutOrder | null;
}

export function checkoutTokenExpired(createdAt: string, maxAgeMs: number) {
  const createdAtMs = Date.parse(createdAt);
  return !Number.isFinite(createdAtMs) || createdAtMs > Date.now() || Date.now() - createdAtMs > maxAgeMs;
}
