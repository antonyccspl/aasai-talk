import { Platform } from "react-native";

type CheckoutInput = {
  orderId: string;
  paymentSessionId: string;
};

export async function startCashfreeCheckout(input: CheckoutInput) {
  if (Platform.OS === "web") {
    const checkout = await import("./cashfree-checkout.web");
    return checkout.startCashfreeCheckout(input);
  }
  const checkout = await import("./cashfree-checkout.native");
  return checkout.startCashfreeCheckout(input);
}
