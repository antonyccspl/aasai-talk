import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export type CashfreeOrder = {
  order_id: string;
  payment_session_id: string;
  checkout_token?: string;
  amount_paise: number;
  coins: number;
};

export type CashfreeCheckoutSession = {
  order_id: string;
  payment_session_id: string;
  amount_paise: number;
  coins: number;
};

export type CashfreePaymentStatus = {
  status: "created" | "pending" | "paid" | "failed";
  credited: boolean;
  coins?: number;
};

async function request<T>(idToken: string, endpoint: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${endpoint}`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = value && typeof value === "object" && "error" in value && typeof value.error === "string"
      ? value.error : "Cashfree payment request failed.";
    throw new Error(message);
  }
  return value as T;
}

export function createCashfreeOrder(idToken: string, coinPackId: string, includeCheckoutToken = false) {
  return request<CashfreeOrder>(idToken, "cashfree-create-order", {
    coin_pack_id: coinPackId,
    include_checkout_token: includeCheckoutToken,
  });
}

export function getCashfreePaymentStatus(idToken: string, orderId: string) {
  return request<CashfreePaymentStatus>(idToken, "cashfree-payment-status", { order_id: orderId });
}

export function getCashfreeCheckoutSession(checkoutToken: string) {
  return request<CashfreeCheckoutSession>(checkoutToken, "cashfree-checkout-session", {});
}

export function getCashfreeCheckoutStatus(checkoutToken: string) {
  return request<CashfreePaymentStatus>(checkoutToken, "cashfree-checkout-status", {});
}
