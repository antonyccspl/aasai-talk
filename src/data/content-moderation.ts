import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export async function submitProfilePhotoForModeration(idToken: string, uri: string) {
  const photoResponse = await fetch(uri);
  if (!photoResponse.ok) throw new Error("Could not read the selected photo.");
  const blob = await photoResponse.blob();
  const type = blob.type || "image/jpeg";
  const form = new FormData();
  form.append("action", "submit-profile-photo");
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
  if (payload.status !== "approved" || !("public_url" in payload) || typeof payload.public_url !== "string") {
    throw new Error(payload.status === "rejected" ? "This photo cannot be used because it breaks Aasai Talk’s nudity policy." : "Your photo is being reviewed for safety. Please try again after it is approved.");
  }
  return payload.public_url;
}

export async function scanVideoCallFrame(idToken: string, frame: string) {
  const response = await fetch(frame);
  if (!response.ok) throw new Error("Could not read the video safety sample.");
  const blob = await response.blob();
  if (!blob.size) throw new Error("The video safety sample was empty.");
  const form = new FormData();
  form.append("action", "scan-call-frame");
  form.append("frame", blob, "call-frame.jpg");
  const scanResponse = await fetch(`${supabaseUrl}/functions/v1/content-moderation`, {
    method: "POST",
    headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${idToken}` },
    body: form,
  });
  const payload: unknown = await scanResponse.json().catch(() => null);
  if (!scanResponse.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "The video safety check could not be completed.";
    throw new Error(message);
  }
  if (!payload || typeof payload !== "object" || !('status' in payload) || typeof payload.status !== "string")
    throw new Error("Invalid video safety result.");
  return payload.status as "approved" | "needs_review" | "rejected";
}
