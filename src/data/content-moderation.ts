import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export type ProfilePhotoModerationResult =
  | { id: string; status: "approved"; publicUrl: string }
  | { id: string; status: "needs_review" };

export async function submitProfilePhotoForModeration(idToken: string, uri: string) {
  const photoResponse = await fetch(uri);
  if (!photoResponse.ok) throw new Error("Could not read the selected photo.");
  const blob = await photoResponse.blob();
  const type = blob.type || "image/jpeg";
  const form = new FormData();
  form.append("action", "submit-host-application-photo");
  form.append("photo", blob, `profile.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`);
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/content-moderation`, {
      method: "POST",
      headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${idToken}` },
      body: form,
    });
  } catch {
    throw new Error("We could not reach the photo safety service. Check your connection and try again.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : `Photo safety check failed (code ${response.status}).`;
    throw new Error(message);
  }
  if (!payload || typeof payload !== "object" || !("status" in payload) || typeof payload.status !== "string")
    throw new Error("Invalid photo safety result.");
  if (payload.status === "approved" && "id" in payload && typeof payload.id === "string"
      && "public_url" in payload && typeof payload.public_url === "string") {
    return { id: payload.id, status: "approved", publicUrl: payload.public_url } satisfies ProfilePhotoModerationResult;
  }
  if (payload.status === "needs_review" && "id" in payload && typeof payload.id === "string") {
    return { id: payload.id, status: "needs_review" } satisfies ProfilePhotoModerationResult;
  }
  if (payload.status !== "approved") {
    const message = "message" in payload && typeof payload.message === "string"
      ? payload.message
      : payload.status === "rejected"
        ? "This photo was rejected. Choose a different photo."
        : "The photo could not be submitted for review. Please try again.";
    throw new Error(message);
  }
  throw new Error("Invalid approved photo result.");
}

export async function publishProfilePhoto(idToken: string, uri: string) {
  const photoResponse = await fetch(uri);
  if (!photoResponse.ok) throw new Error("Could not read the selected photo.");
  const blob = await photoResponse.blob();
  const type = blob.type || "image/jpeg";
  const form = new FormData();
  form.append("action", "publish-profile-photo");
  form.append("photo", blob, `profile.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`);

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/content-moderation`, {
      method: "POST",
      headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${idToken}` },
      body: form,
    });
  } catch {
    throw new Error("We could not reach the profile photo service. Check your connection and try again.");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : `Profile photo upload failed (code ${response.status}).`;
    throw new Error(message);
  }
  if (
    payload
    && typeof payload === "object"
    && "status" in payload
    && payload.status === "published"
    && "public_url" in payload
    && typeof payload.public_url === "string"
    && /^https:\/\//i.test(payload.public_url)
  ) return { publicUrl: payload.public_url };
  throw new Error("The profile photo could not be published.");
}
