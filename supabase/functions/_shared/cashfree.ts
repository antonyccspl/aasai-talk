const encoder = new TextEncoder();

export type CashfreePayment = {
  cf_payment_id?: string | number;
  payment_status?: string;
  payment_amount?: number;
  payment_currency?: string;
};

function environment() {
  const value = (Deno.env.get("CASHFREE_ENVIRONMENT") || "sandbox").trim().toLowerCase();
  if (value !== "sandbox" && value !== "production") throw new Error("Cashfree environment is invalid.");
  return value;
}

function credentials() {
  const appId = Deno.env.get("CASHFREE_APP_ID") || "";
  const secret = Deno.env.get("CASHFREE_SECRET_KEY") || "";
  if (!appId || !secret) throw new Error("Cashfree credentials are not configured.");
  return { appId, secret };
}

function baseUrl() {
  return environment() === "production" ? "https://api.cashfree.com" : "https://sandbox.cashfree.com";
}

function headers() {
  const { appId, secret } = credentials();
  return {
    "x-client-id": appId,
    "x-client-secret": secret,
    "x-api-version": "2025-01-01",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function createCashfreePaymentOrder(input: Record<string, unknown>) {
  const response = await fetch(`${baseUrl()}/pg/orders`, {
    method: "POST", headers: headers(), body: JSON.stringify(input),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body && typeof body === "object" && "message" in body && typeof body.message === "string"
    ? body.message : "Cashfree could not create the payment order.");
  return body as { payment_session_id?: unknown; order_id?: unknown };
}

export async function fetchCashfreeOrderPayments(orderId: string) {
  const response = await fetch(`${baseUrl()}/pg/orders/${encodeURIComponent(orderId)}/payments`, {
    headers: headers(),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message : "Cashfree payment status could not be verified.";
    throw new Error(message);
  }
  // Cashfree has returned both a direct array and a { data: [...] } envelope
  // across API versions. Accept either response without trusting client input.
  if (Array.isArray(body)) return body as CashfreePayment[];
  if (body && typeof body === "object" && "data" in body && Array.isArray(body.data))
    return body.data as CashfreePayment[];
  throw new Error("Cashfree returned an invalid payment-status response.");
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function verifyCashfreeWebhook(signature: string, timestamp: string, rawBody: string) {
  if (!signature || !timestamp || !/^[0-9]{10,20}$/.test(timestamp)) return false;
  const { secret } = credentials();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const actual = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(timestamp + rawBody)));
  const expected = base64(actual);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  return mismatch === 0;
}
