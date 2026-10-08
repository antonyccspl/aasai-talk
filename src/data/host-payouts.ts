import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export type HostPayoutAccount = {
  account_holder_name: string;
  payout_method: "bank" | "upi";
  masked_account_number: string | null;
  ifsc_code: string | null;
  masked_upi_id: string | null;
  status: "pending_verification" | "verified" | "rejected";
  verification_note: string | null;
  updated_at: string;
};

export type HostWithdrawal = {
  id: string;
  amount_paise: number;
  status: "pending" | "processing" | "completed" | "rejected" | "failed";
  payout_reference: string | null;
  review_note: string | null;
  created_at: string;
};

async function hostPayoutRequest<T>(idToken: string, action: string, payload: Record<string, unknown> = {}) {
  const result = await fetch(`${supabaseUrl}/functions/v1/host-payouts`, {
    method: "POST",
    headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const body: unknown = await result.json().catch(() => null);
  if (!result.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error : "Payout request failed.";
    throw new Error(message);
  }
  return body as T;
}

export async function fetchHostPayoutStatus(idToken: string) {
  const result = await hostPayoutRequest<{ payout_account: HostPayoutAccount | null; withdrawals: HostWithdrawal[] }>(idToken, "status");
  if (!Array.isArray(result.withdrawals)) throw new Error("Invalid withdrawal history.");
  return result;
}

export function saveHostPayoutAccount(idToken: string, details: {
  accountHolderName: string;
  payoutMethod: "bank" | "upi";
  accountNumber?: string;
  ifscCode?: string;
  upiId?: string;
}) {
  return hostPayoutRequest(idToken, "save-account", {
    account_holder_name: details.accountHolderName,
    payout_method: details.payoutMethod,
    account_number: details.accountNumber || "",
    ifsc_code: details.ifscCode || "",
    upi_id: details.upiId || "",
  });
}

export function requestHostWithdrawal(idToken: string, amountPaise: number) {
  return hostPayoutRequest<{ withdrawal_id: string }>(idToken, "request-withdrawal", { amount_paise: amountPaise });
}
