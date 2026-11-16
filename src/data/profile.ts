import { supabase, withSupabaseRequestTimeout } from "./supabase";
import { submitProfilePhotoForModeration } from "./content-moderation";

function describeDatabaseError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  )
    return error.message;
  return fallback;
}

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
  guidelinesAccepted?: boolean;
  adultAgeConfirmed?: boolean;
};

export type DemoProfileSaveResult = {
  photo?: string;
  photoStatus: "unchanged" | "approved" | "needs_review" | "not_saved";
  photoMessage?: string;
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
    guidelinesAccepted: true,
    adultAgeConfirmed: true,
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

export async function saveDemoProfile(
  phone: string,
  profile: UserProfile,
  idToken?: string,
  previousApprovedPhoto?: string,
): Promise<DemoProfileSaveResult> {
  const isApprovedPhoto = (value?: string) =>
    typeof value === "string" && /^https:\/\//i.test(value);
  let photo = isApprovedPhoto(profile.photo)
    ? profile.photo
    : isApprovedPhoto(previousApprovedPhoto)
      ? previousApprovedPhoto
      : undefined;
  let photoStatus: DemoProfileSaveResult["photoStatus"] = "unchanged";
  let photoMessage: string | undefined;

  if (profile.photo && !isApprovedPhoto(profile.photo)) {
    if (!idToken) {
      photoStatus = "not_saved";
      photoMessage = "Sign in again before uploading a profile photo.";
    } else {
      try {
        const result = await submitProfilePhotoForModeration(idToken, profile.photo);
        if (result.status === "approved") {
          photo = result.publicUrl;
          photoStatus = "approved";
        } else {
          photoStatus = "needs_review";
          photoMessage =
            "The new photo is awaiting safety review and will appear after approval.";
        }
      } catch (error) {
        photoStatus = "not_saved";
        photoMessage = describeDatabaseError(
          error,
          "We could not update your profile photo.",
        );
      }
    }
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
  if (error)
    throw new Error(
      describeDatabaseError(error, "We could not save your profile. Please try again."),
    );
  return { photo, photoStatus, photoMessage };
}

export async function fetchDemoProfile(phone: string): Promise<UserProfile | null> {
  const { data, error } = await withSupabaseRequestTimeout((signal) =>
    supabase
      .rpc("get_phone_identity_profile", { input_phone: phone })
      .abortSignal(signal),
  );
  if (error) throw error;
  if (!data || typeof data !== "object") return null;
  const profile = data as Record<string, unknown>;
  // A phone identity is created before its owner finishes onboarding. Its
  // profile is therefore legitimately empty or partial at this point and
  // must take the user to profile setup, not fail authenticated refresh.
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
    return null;
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
    guidelinesAccepted: true,
    adultAgeConfirmed: true,
  };
}
