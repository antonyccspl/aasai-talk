import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebasePhoneToken } from "../_shared/firebase-auth.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.trim()) return error.message;
  return "Unable to upload the verification document.";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "POST required." }, { status: 405, headers: corsHeaders });
  try {
    const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const identity = await verifyFirebasePhoneToken(token);
    const form = await request.formData(); const kind = form.get("kind"); const file = form.get("file");
    if ((kind !== "aadhaar" && kind !== "pan") || !(file instanceof File) || !allowedTypes.has(file.type) || file.size > 10 * 1024 * 1024)
      return Response.json({ error: "Upload a JPG, PNG, WEBP, or PDF smaller than 10 MB." }, { status: 400, headers: corsHeaders });
    const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS"); if (!url || !key) throw new Error("Document storage is not configured.");
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: profile, error: profileError } = await admin.from("phone_profiles").select("gender").eq("phone", identity.phone).maybeSingle();
    if (profileError || profile?.gender !== "Female") return Response.json({ error: "Only completed female Host profiles can upload verification documents." }, { status: 403, headers: corsHeaders });
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1]; const path = `${identity.phone.replace(/\D/g, "")}/${kind}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage.from("host-verification").upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false }); if (uploadError) throw uploadError;
    return Response.json({ path, name: file.name }, { headers: corsHeaders });
  } catch (error) { console.error("Host verification document upload failed:", error); return Response.json({ error: errorMessage(error) }, { status: 500, headers: corsHeaders }); }
});
