import { supabase } from "./supabase";

export type HostDailyCallTime = {
  seconds: number;
  calls: number;
  date: string;
};

export type HostDailyCallSummary = HostDailyCallTime;
export type HostCurrentSlab = {
  id: string;
  call_type: "AUDIO" | "VIDEO";
  min_minutes: number;
  max_minutes: number | null;
  diamonds_per_minute: number;
  coins_per_diamond: number;
  daily_seconds: number;
};

export async function fetchHostDailyCallTime(phone: string) {
  const { data, error } = await supabase.rpc("get_host_daily_call_time", {
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("Invalid Host call-time response.");
  const row = data as Record<string, unknown>;
  if (
    typeof row.seconds !== "number" ||
    typeof row.calls !== "number" ||
    typeof row.date !== "string"
  )
    throw new Error("Invalid Host call-time response.");
  return row as HostDailyCallTime;
}

export async function fetchHostDailyCallSummary(phone: string) {
  const { data, error } = await supabase.rpc("get_host_daily_call_summary", {
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || !data.every((row) =>
    row && typeof row === "object" &&
    typeof row.date === "string" &&
    typeof row.seconds === "number" &&
    typeof row.calls === "number"
  ))
    throw new Error("Invalid Host daily summary response.");
  return data as HostDailyCallSummary[];
}

export async function fetchHostCurrentSlabs(phone: string) {
  const results = await Promise.all(
    (["audio", "video"] as const).map(async (callType) => {
      const { data, error } = await supabase.rpc("get_receiver_coin_diamond_slab", {
        input_host_phone: phone,
        input_call_type: callType,
      });
      if (error) throw new Error(error.message);
      if (!data || typeof data !== "object") throw new Error("Invalid Host slab response.");
      const row = data as Record<string, unknown>;
      if (
        typeof row.id !== "string" ||
        !["AUDIO", "VIDEO"].includes(String(row.call_type)) ||
        typeof row.min_minutes !== "number" ||
        (row.max_minutes !== null && typeof row.max_minutes !== "number") ||
        typeof row.diamonds_per_minute !== "number" ||
        typeof row.coins_per_diamond !== "number" ||
        typeof row.daily_seconds !== "number"
      )
        throw new Error("Invalid Host slab response.");
      return row as unknown as HostCurrentSlab;
    }),
  );
  return results;
}
