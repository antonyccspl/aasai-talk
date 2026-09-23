import { supabase } from "./supabase";

export type UserProfile = {
  name: string;
  username: string;
  bio: string;
  languages: string[];
  interests: string[];
  dob: string;
  gender: string;
  city: string;
  photo?: string;
};

type ProfileRow = {
  username: string | null;
  display_name: string;
  bio: string;
  languages: string[];
  interests: string[];
  date_of_birth: string;
  gender: string;
  city: string;
};

export async function fetchOwnProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "username,display_name,bio,languages,interests,date_of_birth,gender,city",
    )
    .maybeSingle<ProfileRow>();
  if (error) throw error;
  if (!data) return null;
  return {
    name: data.display_name,
    username: data.username || "",
    bio: data.bio,
    languages: data.languages,
    interests: data.interests,
    dob: data.date_of_birth,
    gender: data.gender,
    city: data.city,
  };
}

export async function saveOwnProfile(profile: UserProfile) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user)
    throw new Error("You must be signed in to save your profile.");

  const { error } = await supabase.from("profiles").upsert({
    id: userData.user.id,
    username: profile.username || null,
    display_name: profile.name.trim(),
    gender: profile.gender,
    date_of_birth: profile.dob,
    bio: profile.bio.trim(),
    city: profile.city.trim(),
    languages: profile.languages,
    interests: profile.interests,
  });
  if (error) throw error;
}

export async function saveDemoProfile(phone: string, profile: UserProfile) {
  let photo = profile.photo;
  if (photo && !photo.startsWith("http")) {
    const response = await fetch(photo);
    const blob = await response.blob();
    const path = `${phone.replace(/\D/g, "")}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("host-photos")
      .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: true });
    if (uploadError) throw uploadError;
    photo = supabase.storage.from("host-photos").getPublicUrl(path).data.publicUrl;
  }
  const { error } = await supabase.rpc("complete_phone_identity", {
    input_phone: phone,
    input_profile: {
      ...profile,
      dob: profile.dob,
      gender: profile.gender,
      photo,
    },
  });
  if (error) throw error;
}

export async function fetchDemoProfile(phone: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.rpc("get_phone_identity_profile", {
    input_phone: phone,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") return null;
  const profile = data as Record<string, unknown>;
  if (
    typeof profile.name !== "string" ||
    typeof profile.username !== "string" ||
    typeof profile.bio !== "string" ||
    !Array.isArray(profile.languages) ||
    !Array.isArray(profile.interests) ||
    typeof profile.dob !== "string" ||
    typeof profile.gender !== "string" ||
    typeof profile.city !== "string"
  )
    throw new Error("Saved phone profile has an invalid format.");
  return {
    name: profile.name,
    username: profile.username,
    bio: profile.bio,
    languages: profile.languages.filter(
      (value): value is string => typeof value === "string",
    ),
    interests: profile.interests.filter(
      (value): value is string => typeof value === "string",
    ),
    dob: profile.dob,
    gender: profile.gender,
    city: profile.city,
    photo: typeof profile.photo === "string" ? profile.photo : undefined,
  };
}
