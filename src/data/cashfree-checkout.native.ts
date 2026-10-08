import { CFPaymentGatewayService, type CFCallback } from "react-native-cashfree-pg-sdk";
import { CFEnvironment, CFSession } from "cashfree-pg-api-contract";

type CheckoutInput = {
  orderId: string;
  paymentSessionId: string;
};

export function startCashfreeCheckout({ orderId, paymentSessionId }: CheckoutInput) {
  return new Promise<void>((resolve, reject) => {
    const callback: CFCallback = {
      onVerify: (verifiedOrderId) => {
        CFPaymentGatewayService.removeCallback();
        if (verifiedOrderId !== orderId) {
          reject(new Error("Cashfree returned an unexpected payment order."));
          return;
        }
        resolve();
      },
      onError: (error) => {
        CFPaymentGatewayService.removeCallback();
        reject(new Error(error?.getMessage() || "Cashfree checkout could not be completed."));
      },
    };
    try {
      CFPaymentGatewayService.setCallback(callback);
      CFPaymentGatewayService.doWebPayment(
        new CFSession(paymentSessionId, orderId, CFEnvironment.SANDBOX),
      );
    } catch (error) {
      CFPaymentGatewayService.removeCallback();
      reject(error instanceof Error ? error : new Error("Cashfree checkout could not start."));
    }
  });
}
