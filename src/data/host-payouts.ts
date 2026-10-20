import { supabasePublishableKey, supabaseUrl } from "./supabase-config";
import { supabase } from "./supabase";

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
  status: "pending" | "in_review" | "processing" | "completed" | "rejected" | "failed";
  created_at: string;
  review_due_at?: string;
};

export type HostPayoutNotification = {
  id: string;
  withdrawal_id: string;
  amount_paise: number;
  status: HostWithdrawal["status"];
  review_note: string | null;
  created_at: string;
  read_at: string | null;
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

export async function fetchHostPayoutNotifications(phone: string) {
  if (!/^\+91\d{10}$/.test(phone)) return [] as HostPayoutNotification[];
  const { data, error } = await supabase.rpc("get_phone_host_payout_notifications", {
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || !data.every((row) => {
    if (!row || typeof row !== "object") return false;
    const notification = row as Record<string, unknown>;
    const amountPaise = typeof notification.amount_paise === "number"
      ? notification.amount_paise
      : typeof notification.amount_paise === "string" && /^\d+$/.test(notification.amount_paise)
        ? Number(notification.amount_paise)
        : NaN;
    return typeof notification.id === "string" &&
      typeof notification.withdrawal_id === "string" &&
      Number.isSafeInteger(amountPaise) &&
      amountPaise > 0 &&
      typeof notification.status === "string" &&
      ["pending", "in_review", "processing", "completed", "rejected", "failed"].includes(notification.status) &&
      (typeof notification.review_note === "string" || notification.review_note === null) &&
      typeof notification.created_at === "string" &&
      (typeof notification.read_at === "string" || notification.read_at === null);
  })) throw new Error("Invalid Host payout notifications returned by the server.");
  return data.map((row) => ({
    ...row,
    amount_paise: typeof row.amount_paise === "string" ? Number(row.amount_paise) : row.amount_paise,
  })) as HostPayoutNotification[];
}

export async function markHostPayoutNotificationRead(notificationId: string, phone: string) {
  const { error } = await supabase.rpc("mark_phone_host_payout_notification_read", {
    input_notification_id: notificationId,
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
}
