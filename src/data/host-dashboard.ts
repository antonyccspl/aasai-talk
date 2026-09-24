import { supabase } from "./supabase";

export type HostDashboard = {
  today_calls: number;
  today_seconds: number;
  today_earnings_paise: number;
  total_calls: number;
  total_earnings_paise: number;
  active_calls: number;
  missed_calls: number;
  recent_calls: {
    id: string;
    caller_phone: string;
    call_type: "audio" | "video";
    status: "ended" | "missed" | "rejected";
    duration_seconds: number;
    created_at: string;
  }[];
};

export async function fetchPhoneHostDashboard(phone: string) {
  const { data, error } = await supabase.rpc("get_phone_host_dashboard", { input_phone: phone });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("Invalid host dashboard response.");
  const row = data as Record<string, unknown>;
  const counts = ["today_calls", "today_seconds", "today_earnings_paise", "total_calls", "total_earnings_paise", "active_calls", "missed_calls"];
  if (!counts.every((key) => typeof row[key] === "number" && (row[key] as number) >= 0) || !Array.isArray(row.recent_calls))
    throw new Error("Invalid host dashboard response.");
  if (!row.recent_calls.every((item) => {
    if (!item || typeof item !== "object") return false;
    const call = item as Record<string, unknown>;
    return typeof call.id === "string" && typeof call.caller_phone === "string" &&
      (call.call_type === "audio" || call.call_type === "video") &&
      ["ended", "missed", "rejected"].includes(String(call.status)) &&
      typeof call.duration_seconds === "number" && typeof call.created_at === "string";
  })) throw new Error("Invalid host recent-call response.");
  return row as unknown as HostDashboard;
}
