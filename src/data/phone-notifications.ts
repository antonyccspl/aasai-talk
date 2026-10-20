import { supabase } from "./supabase";

export async function fetchDismissedPhoneAnnouncementIds(phone: string) {
  if (!/^\+91\d{10}$/.test(phone)) return [] as string[];
  const { data, error } = await supabase.rpc("get_phone_dismissed_announcement_ids", {
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || !data.every((id) => typeof id === "string")) {
    throw new Error("Invalid dismissed announcements returned by the server.");
  }
  return data as string[];
}

export async function clearAllPhoneNotifications(phone: string) {
  if (!/^\+91\d{10}$/.test(phone)) throw new Error("Invalid phone");
  const { data, error } = await supabase.rpc("clear_phone_notifications", {
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || !data.every((id) => typeof id === "string")) {
    throw new Error("Invalid clear-notifications response returned by the server.");
  }
  return data as string[];
}
