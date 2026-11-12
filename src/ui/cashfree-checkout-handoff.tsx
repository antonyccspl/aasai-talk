import { getCashfreeCheckoutSession, getCashfreeCheckoutStatus } from "@/data/cashfree";
import { startCashfreeCheckout } from "@/data/cashfree-checkout";
import { Button, Card, Empty, Notice, Shell, T } from "@/ui/components";
import { useEffect, useState } from "react";
import { Linking } from "react-native";

type CheckoutSession = Awaited<ReturnType<typeof getCashfreeCheckoutSession>>;
type CheckoutState = "loading" | "ready" | "opening" | "pending" | "paid" | "failed" | "error";

function returnToNativeApp(orderId: string) {
  return Linking.openURL(`aasai-talk://wallet/recharge?order_id=${encodeURIComponent(orderId)}`);
}

export function CashfreeCheckoutHandoff({
  checkoutToken,
  returnToApp,
}: {
  checkoutToken: string;
  returnToApp: boolean;
}) {
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null);
  const [state, setState] = useState<CheckoutState>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }
    void getCashfreeCheckoutSession(checkoutToken)
      .then((session) => {
        if (!active) return;
        setCheckout(session);
        setState("ready");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Secure checkout could not be loaded.");
        setState("error");
      });
    return () => { active = false; };
  }, [checkoutToken]);

  useEffect(() => {
    if (state !== "pending" || !checkout) return;
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await getCashfreeCheckoutStatus(checkoutToken);
        if (!active) return;
        setError("");
        if (result.status === "paid" || result.status === "failed") {
          setState(result.status);
          if (returnToApp) {
            window.setTimeout(() => {
              void returnToNativeApp(checkout.order_id).catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : "Could not return to Aasai Talk.");
              });
            }, 1200);
          }
          return;
        }
        timeout = setTimeout(poll, 3000);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Payment status could not be checked.");
        timeout = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [checkout, checkoutToken, returnToApp, state]);

  const beginCheckout = async () => {
    if (!checkout) return;
    setError("");
    setState("opening");
    try {
      await startCashfreeCheckout({
        orderId: checkout.order_id,
        paymentSessionId: checkout.payment_session_id,
      });
      setState("pending");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Secure checkout could not be opened.");
      setState("ready");
    }
  };

  const returnToAppNow = async () => {
    if (!checkout) return;
    try {
      await returnToNativeApp(checkout.order_id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not return to Aasai Talk.");
    }
  };

  return (
    <Shell title="Secure payment">
      {state === "loading" && <Empty icon="shield" title="Preparing secure checkout" message="Verifying your recharge with Aasai Talk…" />}
      {state === "error" && (
        <>
          <Empty icon="shield" title="Checkout needs attention" message="Your payment has not been confirmed. Return to Aasai Talk to check its status or start again." />
          <Notice error>{error}</Notice>
          {returnToApp && checkout && <Button title="Return to Aasai Talk" onPress={() => void returnToAppNow()} />}
        </>
      )}
      {checkout && state !== "loading" && state !== "error" && (
        <>
          <T size={24} bold>Complete your recharge</T>
          <Card>
            <T color="#766871">Coin top-up</T>
            <T size={32} bold>{checkout.coins.toLocaleString("en-IN")} coins</T>
            <T color="#766871">₹{(checkout.amount_paise / 100).toLocaleString("en-IN")}</T>
            <T size={12} color="#766871">This purchase is securely linked to the account that started it in Aasai Talk.</T>
          </Card>
          {state === "paid" && <Notice tone="success" title="Payment received">Payment confirmed. Returning to Aasai Talk to update your wallet…</Notice>}
          {state === "failed" && <Notice tone="error" title="Payment incomplete">Payment was not completed. No coins were added.</Notice>}
          {state === "pending" && <Notice tone="info" title="Confirming your payment">Waiting for payment confirmation. Please keep this page open until checkout finishes.</Notice>}
          {!!error && <Notice error>{error}</Notice>}
          {(state === "ready" || state === "opening") && (
            <Button title={state === "opening" ? "Opening secure checkout…" : `Pay ₹${(checkout.amount_paise / 100).toLocaleString("en-IN")} securely`} disabled={state === "opening"} onPress={() => void beginCheckout()} />
          )}
          {returnToApp && state !== "ready" && state !== "opening" && (
            <Button title="Return to Aasai Talk" variant="secondary" onPress={() => void returnToAppNow()} />
          )}
        </>
      )}
    </Shell>
  );
}
