import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { phoneAuthStatus, verifyPhoneSession } from "../_shared/phone-auth.ts";
import { fileSuffix, hasValidFileSignature } from "../_shared/file-validation.ts";

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

async function sha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function profilePhotoResult(item: {
  id: string;
  status: string;
  public_url: string | null;
  decision_note: string | null;
}) {
  if (item.status === "approved" && item.public_url)
    return reply({ id: item.id, status: "approved", public_url: item.public_url });
  if (item.status === "rejected" || item.status === "removed")
    return reply({
      id: item.id,
      status: "rejected",
      message: item.decision_note || "This photo was rejected. Choose a different photo.",
    });
  return reply({
    id: item.id,
    status: "needs_review",
    message: "Your photo is waiting for a moderator safety review. Keep it selected and tap Submit again after approval.",
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "POST required." }, 405);
  try {
    const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!token) return reply({ error: "Please sign in to continue." }, 401);
    const identity = await verifyPhoneSession(token);
    const form = await request.formData();
    const action = form.get("action");
    if (action === "scan-call-frame")
      return reply({ status: "not_scanned" });
    if (action !== "submit-profile-photo")
      return reply({ error: "Unsupported moderation action." }, 400);

    const file = form.get("photo");
    if (!(file instanceof File) || !supportedTypes.has(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024)
      return reply({ error: "Use a JPG, PNG, or WEBP image smaller than 5 MB." }, 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasValidFileSignature(bytes, file.type))
      return reply({ error: "The selected photo does not match its image type." }, 400);
    const contentSha256 = await sha256(bytes);
    const admin = adminClient();
    const { data: existing, error: existingError } = await admin
      .from("phone_content_moderation_items")
      .select("id,status,public_url,decision_note")
      .eq("owner_phone", identity.phone)
      .eq("content_type", "profile_photo")
      .eq("content_sha256", contentSha256)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return profilePhotoResult(existing);

    const path = `${identity.phone.replace(/\D/g, "")}/${crypto.randomUUID()}.${fileSuffix(file.type)}`;
    const upload = await admin.storage.from("moderation-media").upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (upload.error) throw upload.error;

    const { data: item, error: itemError } = await admin
      .from("phone_content_moderation_items")
      .insert({
        owner_phone: identity.phone,
        content_type: "profile_photo",
        storage_bucket: "moderation-media",
        storage_path: path,
        media_type: file.type,
        content_sha256: contentSha256,
        scan_provider: "manual",
        provider_result: { review_method: "super_admin_queue" },
        status: "needs_review",
        decision_note: "Waiting for a moderator photo-safety review.",
        updated_at: new Date().toISOString(),
      })
      .select("id,status,public_url,decision_note")
      .single();
    if (itemError) {
      const { error: cleanupError } = await admin.storage.from("moderation-media").remove([path]);
      if (cleanupError) console.error("Duplicate photo cleanup failed:", cleanupError.message);
      if (itemError.code !== "23505") throw itemError;

      const { data: duplicate, error: duplicateError } = await admin
        .from("phone_content_moderation_items")
        .select("id,status,public_url,decision_note")
        .eq("owner_phone", identity.phone)
        .eq("content_type", "profile_photo")
        .eq("content_sha256", contentSha256)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (duplicateError || !duplicate) throw duplicateError || itemError;
      return profilePhotoResult(duplicate);
    }

    return profilePhotoResult(item);
  } catch (error) {
    console.error("Content moderation failed:", error);
    return reply(
      { error: error instanceof Error ? error.message : "Content moderation failed." },
      phoneAuthStatus(error) ?? 500,
    );
  }
});
