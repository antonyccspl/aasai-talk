import { supabaseUrl, supabasePublishableKey } from "./supabase-config";

export type ZegoCallToken = {
  appId: number;
  userId: string;
  roomId: string;
  token: string;
  expiresAt: number;
  webServerUrl?: string;
};

export type CallNetworkQuality =
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "disconnected"
  | "unknown";

export function normalizeCallNetworkQuality(...values: unknown[]): CallNetworkQuality {
  const rank: Record<CallNetworkQuality, number> = {
    excellent: 0,
    good: 1,
    fair: 2,
    poor: 3,
    disconnected: 4,
    unknown: -1,
  };
  const normalized = values.map((value): CallNetworkQuality => {
    const grade = String(value).toLowerCase();
    if (grade === "0" || grade.includes("excellent")) return "excellent";
    if (grade === "1" || grade.includes("good")) return "good";
    if (grade === "2" || grade.includes("medium") || grade.includes("normal")) return "fair";
    if (grade === "3" || grade.includes("bad") || grade.includes("poor")) return "poor";
    if (grade === "4" || grade.includes("die") || grade.includes("failed")) return "disconnected";
    return "unknown";
  });
  return normalized.reduce(
    (worst, current) => rank[current] > rank[worst] ? current : worst,
    "unknown",
  );
}

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
    ...(typeof data.web_server_url === "string" && data.web_server_url
      ? { webServerUrl: data.web_server_url }
      : {}),
  };
}
