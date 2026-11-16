import { supabase } from "./supabase";

export type HostMaleMember = {
  phone: string;
  displayName: string;
  photoUrl: string | null;
  age: number;
  city: string;
  languages: string[];
  interests: string[];
  bio: string;
  availability: "Available" | "Busy" | "Offline";
  availableCoins: number;
};

export async function fetchHostMaleMembers(): Promise<HostMaleMember[]> {
  const { data, error } = await supabase.rpc("get_host_male_members");
  if (error) throw new Error(error.message);
  if (
    !Array.isArray(data) ||
    !data.every((row) => {
      if (!row || typeof row !== "object") return false;
      const value = row as Record<string, unknown>;
      return (
        typeof value.member_phone === "string" &&
        /^\+91\d{10}$/.test(value.member_phone) &&
        typeof value.display_name === "string" &&
        value.display_name.trim().length > 0 &&
        (value.avatar_url === null || typeof value.avatar_url === "string") &&
        typeof value.member_age === "number" &&
        Number.isInteger(value.member_age) &&
        value.member_age >= 18 &&
        value.member_age <= 120 &&
        typeof value.member_city === "string" &&
        Array.isArray(value.member_languages) &&
        value.member_languages.every((language) => typeof language === "string") &&
        Array.isArray(value.member_interests) &&
        value.member_interests.every((interest) => typeof interest === "string") &&
        typeof value.member_bio === "string" &&
        (value.availability === "Available" ||
          value.availability === "Busy" ||
          value.availability === "Offline") &&
        typeof value.available_coins === "number" &&
        Number.isFinite(value.available_coins) &&
        value.available_coins >= 0
      );
    })
  )
    throw new Error("Invalid member list returned by the server.");

  return data.map((row) => ({
    phone: row.member_phone,
    displayName: row.display_name,
    photoUrl: row.avatar_url,
    age: row.member_age,
    city: row.member_city,
    languages: row.member_languages,
    interests: row.member_interests,
    bio: row.member_bio,
    availability: row.availability,
    availableCoins: row.available_coins,
  }));
}
