import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebasePhoneToken } from "../_shared/firebase-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const likelihoods = ["UNKNOWN", "VERY_UNLIKELY", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY"];

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!url || !key) throw new Error("Content moderation service is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function decisionFor(adult: string, racy: string) {
  const adultScore = likelihoods.indexOf(adult);
  const racyScore = likelihoods.indexOf(racy);
  if (adultScore >= 4) return "rejected" as const;
  if (adultScore >= 3 || racyScore >= 4) return "needs_review" as const;
  return "approved" as const;
}

function base64Encode(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

async function scanWithGoogleVision(bytes: Uint8Array) {
  const key = Deno.env.get("GOOGLE_VISION_API_KEY");
  if (!key) return { provider: "manual", status: "needs_review" as const, adult: "UNKNOWN", racy: "UNKNOWN", result: { reason: "Scanner not configured" } };
  const encoded = base64Encode(bytes);
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content: encoded }, features: [{ type: "SAFE_SEARCH_DETECTION" }] }] }),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error("The image safety scan could not be completed.");
  const responses = Array.isArray(payload?.responses) ? payload.responses : [];
  const annotation = responses[0] && typeof responses[0] === "object" && (responses[0] as Record<string, unknown>).safeSearchAnnotation && typeof (responses[0] as Record<string, unknown>).safeSearchAnnotation === "object"
    ? (responses[0] as Record<string, unknown>).safeSearchAnnotation as Record<string, unknown> : {};
  const adult = typeof annotation.adult === "string" ? annotation.adult : "UNKNOWN";
  const racy = typeof annotation.racy === "string" ? annotation.racy : "UNKNOWN";
  return { provider: "google_vision", status: decisionFor(adult, racy), adult, racy, result: annotation };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "POST required." }, 405);
  try {
    const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!token) return reply({ error: "Please sign in to continue." }, 401);
    const identity = await verifyFirebasePhoneToken(token);
    const form = await request.formData();
    const action = form.get("action");
    if (action !== "submit-profile-photo") return reply({ error: "Unsupported moderation action." }, 400);
    const file = form.get("photo");
    if (!(file instanceof File) || !supportedTypes.has(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024)
      return reply({ error: "Use a JPG, PNG, or WEBP photo smaller than 5 MB." }, 400);

    const admin = adminClient();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const suffix = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${identity.phone.replace(/\D/g, "")}/${crypto.randomUUID()}.${suffix}`;
    const upload = await admin.storage.from("moderation-media").upload(path, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;

    const scan = await scanWithGoogleVision(bytes);
    const record = {
      owner_phone: identity.phone, content_type: "profile_photo", storage_bucket: "moderation-media", storage_path: path,
      scan_provider: scan.provider, adult_likelihood: scan.adult, racy_likelihood: scan.racy,
      provider_result: scan.result, status: scan.status, decision_note: scan.status === "rejected" ? "Explicit adult content detected." : scan.status === "needs_review" ? "Queued for safety review." : "Automatically approved.",
      updated_at: new Date().toISOString(),
    };
    const { data: item, error: itemError } = await admin.from("phone_content_moderation_items").insert(record).select("id,status,decision_note").single();
    if (itemError) throw itemError;

    if (scan.status === "approved") {
      const publicPath = `${identity.phone.replace(/\D/g, "")}/${crypto.randomUUID()}.${suffix}`;
      const published = await admin.storage.from("host-photos").upload(publicPath, bytes, { contentType: file.type, upsert: false });
      if (published.error) throw published.error;
      const publicUrl = admin.storage.from("host-photos").getPublicUrl(publicPath).data.publicUrl;
      await admin.from("phone_content_moderation_items").update({ public_url: publicUrl, updated_at: new Date().toISOString() }).eq("id", item.id);
      return reply({ id: item.id, status: "approved", public_url: publicUrl });
    }
    return reply({ id: item.id, status: item.status, message: item.decision_note });
  } catch (error) {
    console.error("Content moderation failed:", error);
    return reply({ error: error instanceof Error ? error.message : "Content moderation failed." }, 500);
  }
});
