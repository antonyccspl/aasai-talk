type CheckoutInput = {
  orderId: string;
  paymentSessionId: string;
};

declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => {
      checkout: (options: { paymentSessionId: string; redirectTarget?: "_self" | "_blank" | "_modal" }) => Promise<{ error?: { message?: string } } | undefined>;
    };
  }
}

function loadCashfreeSdk() {
  if (window.Cashfree) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-cashfree-sdk="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Cashfree checkout could not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.dataset.cashfreeSdk = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Cashfree checkout could not load."));
    document.head.appendChild(script);
  });
}

export async function startCashfreeCheckout({ paymentSessionId }: CheckoutInput) {
  await loadCashfreeSdk();
  if (!window.Cashfree) throw new Error("Cashfree checkout could not load.");
  const result = await window.Cashfree({ mode: "production" }).checkout({ paymentSessionId, redirectTarget: "_modal" });
  if (result?.error) throw new Error(result.error.message || "Secure checkout could not be completed. Please try again.");
}
