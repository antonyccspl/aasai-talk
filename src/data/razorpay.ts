import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export type RazorpayOrder = {
  orderId: string;
  providerOrderId: string;
  keyId: string;
  amountPaise: number;
  currency: "INR";
  checkoutUrl: string;
};

type RazorpayWindow = Window & {
  Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
};

function readError(body: unknown, fallback: string) {
  return body && typeof body === "object" && "error" in body &&
    typeof body.error === "string" ? body.error : fallback;
}

async function requestPayment<T>(
  idToken: string,
  action: "create" | "verify" | "status",
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/functions/v1/razorpay-payments?action=${action}`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readError(result, "Unable to process your payment."));
  return result as T;
}

export async function createRazorpayOrder(idToken: string, packId: string): Promise<RazorpayOrder> {
  const result = await requestPayment<Record<string, unknown>>(idToken, "create", { pack_id: packId });
  if (
    typeof result.order_id !== "string" || typeof result.provider_order_id !== "string" ||
    typeof result.key_id !== "string" || typeof result.amount_paise !== "number" ||
    !Number.isSafeInteger(result.amount_paise) || result.amount_paise < 1 ||
    result.currency !== "INR" || typeof result.checkout_url !== "string"
  ) throw new Error("Unable to start secure checkout.");
  return {
    orderId: result.order_id,
    providerOrderId: result.provider_order_id,
    keyId: result.key_id,
    amountPaise: result.amount_paise,
    currency: "INR",
    checkoutUrl: result.checkout_url,
  };
}

async function loadRazorpayScript() {
  const razorpayWindow = window as RazorpayWindow;
  if (razorpayWindow.Razorpay) return razorpayWindow.Razorpay;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Secure checkout could not be loaded. Check your connection and try again."));
    document.head.appendChild(script);
  });
  if (!razorpayWindow.Razorpay) throw new Error("Secure checkout could not be started.");
  return razorpayWindow.Razorpay;
}

async function verifyRazorpayPayment(
  idToken: string,
  orderId: string,
  paymentId: string,
  signature: string,
) {
  const result = await requestPayment<Record<string, unknown>>(idToken, "verify", {
    order_id: orderId,
    payment_id: paymentId,
    signature,
  });
  if (result.status !== "captured" || typeof result.remaining_coins !== "number")
    throw new Error("Your payment is being confirmed. Your coins will appear shortly.");
  return result.remaining_coins;
}

export async function launchRazorpayCheckout(
  idToken: string,
  order: RazorpayOrder,
  description: string,
): Promise<number | null> {
  if (Platform.OS !== "web") {
    const result = await WebBrowser.openAuthSessionAsync(order.checkoutUrl, "aasai-talk://payment");
    if (result.type !== "success") return null;
    const callback = new URL(result.url);
    if (callback.searchParams.get("status") !== "captured")
      throw new Error("Your payment is being confirmed. Your coins will appear shortly.");
    const status = await requestPayment<Record<string, unknown>>(idToken, "status", { order_id: order.orderId });
    return typeof status.remaining_coins === "number" ? status.remaining_coins : null;
  }

  const Razorpay = await loadRazorpayScript();
  return new Promise<number | null>((resolve, reject) => {
    const checkout = new Razorpay({
      key: order.keyId,
      amount: order.amountPaise,
      currency: order.currency,
      name: "Aasai Talk",
      description,
      order_id: order.providerOrderId,
      // Checkout contact details belong to Razorpay's own account session.
      // Never prefill or display a number from an unrelated browser session.
      hidden: { contact: true },
      theme: { color: "#e23744" },
      handler: async (response: Record<string, unknown>) => {
        try {
          if (typeof response.razorpay_payment_id !== "string" || typeof response.razorpay_signature !== "string")
            throw new Error("Payment confirmation was incomplete. Please try again.");
          resolve(await verifyRazorpayPayment(
            idToken,
            order.orderId,
            response.razorpay_payment_id,
            response.razorpay_signature,
          ));
        } catch (error) { reject(error); }
      },
      modal: { ondismiss: () => resolve(null) },
    });
    checkout.open();
  });
}
