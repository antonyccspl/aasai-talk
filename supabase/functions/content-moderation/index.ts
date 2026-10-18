import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebasePhoneToken } from "../_shared/firebase-auth.ts";
import { scanImageWithGoogleVision } from "../_shared/image-moderation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!url || !key) throw new Error("Content moderation service is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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
    const isProfilePhoto = action === "submit-profile-photo";
    const isCallFrame = action === "scan-call-frame";
    if (!isProfilePhoto && !isCallFrame)
      return reply({ error: "Unsupported moderation action." }, 400);
    const file = form.get(isProfilePhoto ? "photo" : "frame");
    const maxSize = isCallFrame ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    if (!(file instanceof File) || !supportedTypes.has(file.type) || file.size < 1 || file.size > maxSize)
      return reply({ error: `Use a JPG, PNG, or WEBP image smaller than ${isCallFrame ? "2" : "5"} MB.` }, 400);

    const admin = adminClient();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const scan = await scanImageWithGoogleVision(bytes);
    // Live-call samples are never stored. We retain an audit item only when a
    // frame needs review or is rejected, which provides safety evidence while
    // avoiding recording ordinary private calls.
    if (isCallFrame) {
      if (scan.status !== "approved") {
        const { error: incidentError } = await admin.from("phone_content_moderation_items").insert({
          owner_phone: identity.phone, content_type: "live_call_incident",
          scan_provider: scan.provider, adult_likelihood: scan.adult, racy_likelihood: scan.racy,
          provider_result: scan.result, status: scan.status,
          decision_note: scan.status === "rejected"
            ? "Explicit adult content detected during a video call."
            : "Video-call frame queued for safety review.",
          updated_at: new Date().toISOString(),
        });
        if (incidentError) throw incidentError;
      }
      return reply({ status: scan.status });
    }

    const suffix = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${identity.phone.replace(/\D/g, "")}/${crypto.randomUUID()}.${suffix}`;
    const upload = await admin.storage.from("moderation-media").upload(path, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;

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
