import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export type PhoneDeletionReason =
  | "Asked for money"
  | "Not interested"
  | "Unable to hear"
  | "Buddy not polite"
  | "Abusive language"
  | "Others";

async function requestPhoneSafety<T>(
  idToken: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/functions/v1/phone-safety`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Safety request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

export async function fetchPhoneBlocks(idToken: string) {
  const result = await requestPhoneSafety<{ blocked_phones: unknown }>(idToken, "list-blocks");
  if (!Array.isArray(result.blocked_phones) || result.blocked_phones.some((phone) => typeof phone !== "string"))
    throw new Error("Invalid blocked-user list from the server.");
  return result.blocked_phones as string[];
}

export async function setPhoneBlock(idToken: string, phone: string, blocked: boolean) {
  await requestPhoneSafety(idToken, blocked ? "block" : "unblock", {
    target_phone: phone,
  });
}

export async function submitPhoneSafetyReport(
  idToken: string,
  phone: string,
  reason: string,
  details: string,
) {
  await requestPhoneSafety(idToken, "report", {
    target_phone: phone,
    reason,
    details,
  });
}

export async function requestPhoneAccountDeletion(
  idToken: string,
  reason: PhoneDeletionReason,
  details: string,
) {
  const result = await requestPhoneSafety<{ scheduled_for: unknown }>(
    idToken,
    "delete-request",
    { reason, details },
  );
  if (typeof result.scheduled_for !== "string")
    throw new Error("Invalid account-deletion request response.");
  return result.scheduled_for;
}