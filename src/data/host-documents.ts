import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export async function uploadHostVerificationDocument(
  idToken: string,
  kind: "aadhaar" | "pan",
  uri: string,
  name: string,
) {
  const source = await fetch(uri);
  if (!source.ok) throw new Error("The selected document could not be read.");
  const blob = await source.blob();
  if (blob.size > 10 * 1024 * 1024) throw new Error("Choose a document smaller than 10 MB.");
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", blob, name);
  const response = await fetch(`${supabaseUrl}/functions/v1/host-documents`, { method: "POST", headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${idToken}` }, body: form });
  const data = await response.json();
  if (!response.ok || typeof data.path !== "string") throw new Error(data.error || "Unable to upload the verification document.");
  return { name: typeof data.name === "string" ? data.name : name, path: data.path };
}
