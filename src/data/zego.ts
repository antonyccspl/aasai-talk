import { supabaseUrl, supabasePublishableKey } from "./supabase-config";

export type ZegoCallToken = {
  appId: number;
  userId: string;
  roomId: string;
  token: string;
  expiresAt: number;
};

export async function fetchZegoCallToken(
  sessionId: string,
  phone: string,
): Promise<ZegoCallToken> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/zego-token`, {
      method: "POST",
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${supabasePublishableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session_id: sessionId, phone }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("Media authorization timed out. Check the network and try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `Call authorization failed (${response.status}).`;
    throw new Error(message);
  }
  if (!body || typeof body !== "object")
    throw new Error("Invalid call authorization response.");
  const data = body as Record<string, unknown>;
  if (
    typeof data.app_id !== "number" ||
    typeof data.user_id !== "string" ||
    typeof data.room_id !== "string" ||
    typeof data.token !== "string" ||
    typeof data.expires_at !== "number"
  )
    throw new Error("Invalid call authorization response.");
  return {
    appId: data.app_id,
    userId: data.user_id,
    roomId: data.room_id,
    token: data.token,
    expiresAt: data.expires_at,
  };
}
