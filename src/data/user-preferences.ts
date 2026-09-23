import { supabase } from "./supabase";

export type UserPreferences = {
  favorites: string[];
  blocked: string[];
  availability: "Available" | "Busy" | "Offline";
};

export async function fetchUserPreferences(): Promise<UserPreferences> {
  const [
    { data: settings, error: settingsError },
    { data: favorites, error: favoritesError },
    { data: blocked, error: blockedError },
  ] = await Promise.all([
    supabase
      .from("user_settings")
      .select("availability")
      .maybeSingle<{ availability: UserPreferences["availability"] }>(),
    supabase.from("favorites").select("favorite_user_id"),
    supabase.from("blocked_users").select("blocked_user_id"),
  ]);
  if (settingsError) throw settingsError;
  if (favoritesError) throw favoritesError;
  if (blockedError) throw blockedError;
  return {
    favorites: (favorites ?? []).map((row) => row.favorite_user_id),
    blocked: (blocked ?? []).map((row) => row.blocked_user_id),
    availability: settings?.availability ?? "Available",
  };
}

export async function saveUserPreferences(preferences: UserPreferences) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) throw new Error("You must be signed in to save preferences.");

  const { error: settingsError } = await supabase.from("user_settings").upsert({
    user_id: userId,
    availability: preferences.availability,
  });
  if (settingsError) throw settingsError;

  const [{ error: favoriteDeleteError }, { error: blockedDeleteError }] =
    await Promise.all([
      supabase.from("favorites").delete().eq("user_id", userId),
      supabase.from("blocked_users").delete().eq("user_id", userId),
    ]);
  if (favoriteDeleteError) throw favoriteDeleteError;
  if (blockedDeleteError) throw blockedDeleteError;

  if (preferences.favorites.length) {
    const { error } = await supabase.from("favorites").insert(
      preferences.favorites.map((favoriteUserId) => ({
        user_id: userId,
        favorite_user_id: favoriteUserId,
      })),
    );
    if (error) throw error;
  }
  if (preferences.blocked.length) {
    const { error } = await supabase.from("blocked_users").insert(
      preferences.blocked.map((blockedUserId) => ({
        user_id: userId,
        blocked_user_id: blockedUserId,
      })),
    );
    if (error) throw error;
  }
}
