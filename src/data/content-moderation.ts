import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export async function submitProfilePhotoForModeration(idToken: string, uri: string) {
  const photoResponse = await fetch(uri);
  if (!photoResponse.ok) throw new Error("Could not read the selected photo.");
  const blob = await photoResponse.blob();
  const type = blob.type || "image/jpeg";
  const form = new FormData();
  form.append("action", "submit-profile-photo");
  form.append("photo", blob, `profile.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`);
  const response = await fetch(`${supabaseUrl}/functions/v1/content-moderation`, {
    method: "POST",
    headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${idToken}` },
    body: form,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "Photo safety check failed.";
    throw new Error(message);
  }
  if (!payload || typeof payload !== "object" || !("status" in payload) || typeof payload.status !== "string")
    throw new Error("Invalid photo safety result.");
  if (payload.status !== "approved" || !("public_url" in payload) || typeof payload.public_url !== "string") {
    throw new Error(payload.status === "rejected" ? "This photo cannot be used because it breaks Aasai Talk’s nudity policy." : "Your photo is being reviewed for safety. Please try again after it is approved.");
  }
  return payload.public_url;
}
