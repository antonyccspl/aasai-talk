import { supabase } from "./supabase";

export type HostOnlineMaleMember = {
  phone: string;
  username: string;
  availability: "Available" | "Busy";
  availableCoins: number;
};

export async function fetchHostOnlineMaleMembers(): Promise<
  HostOnlineMaleMember[]
> {
  const { data, error } = await supabase.rpc("get_host_online_male_members");
  if (error) throw new Error(error.message);
  if (
    !Array.isArray(data) ||
    !data.every((row) => {
      if (!row || typeof row !== "object") return false;
      const value = row as Record<string, unknown>;
      return (
        typeof value.member_phone === "string" &&
        /^\+91\d{10}$/.test(value.member_phone) &&
        typeof value.username === "string" &&
        value.username.length > 0 &&
        (value.availability === "Available" ||
          value.availability === "Busy") &&
        typeof value.available_coins === "number" &&
        Number.isFinite(value.available_coins) &&
        value.available_coins >= 0
      );
    })
  )
    throw new Error("Invalid online member list returned by the server.");

  return data.map((row) => ({
    phone: row.member_phone,
    username: row.username,
    availability: row.availability,
    availableCoins: row.available_coins,
  }));
}
