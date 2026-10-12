import { supabase } from "./supabase";

export type HostDailyCallTime = {
  seconds: number;
  calls: number;
  date: string;
};

export type HostDailyCallSummary = HostDailyCallTime;

export async function fetchHostEarnings(phone: string) {
  const { data, error } = await supabase.rpc("get_phone_host_earnings", {
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "number" || !Number.isSafeInteger(data) || data < 0)
    throw new Error("Invalid Host earnings response.");
  return data / 100;
}

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
