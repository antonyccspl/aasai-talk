import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { phoneAuthStatus, verifyPhoneSession } from "../_shared/phone-auth.ts";
import {
  fileSuffix,
  fileTypeFromSuffix,
  hasValidFileSignature,
} from "../_shared/file-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function priority(reason: string, details = "") {
  return /abusive|sexual|threat|unsafe|scam/i.test(`${reason} ${details}`) ? "high" : "normal";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return Response.json({ error: "POST required" }, { status: 405, headers: corsHeaders });

  try {
    const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!token)
      return Response.json({ error: "Moderator sign-in is required." }, { status: 401, headers: corsHeaders });
    const identity = await verifyPhoneSession(token);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!supabaseUrl || !serviceKey)
      return Response.json({ error: "Moderator service is not configured." }, { status: 503, headers: corsHeaders });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: moderatorRole, error: moderatorRoleError } = await admin
      .from("admin_roles")
      .select("role")
      .eq("user_id", identity.uid)
      .eq("active", true)
      .maybeSingle();
    if (moderatorRoleError) throw moderatorRoleError;
    if (moderatorRole?.role !== "moderator")
      return Response.json({ error: "Moderator access is required." }, { status: 403, headers: corsHeaders });
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "profile-photo-queue") {
      const { data: photos, error: photosError } = await admin.rpc(
        "get_moderator_profile_photo_queue",
        { input_actor_uid: identity.uid },
      );
      if (photosError) throw photosError;
      const reviews = await Promise.all((photos || []).map(async (photo) => {
        const digits = photo.owner_phone.replace(/\D/g, "");
        const expectedPath = new RegExp(
          `^${digits}/[0-9a-f-]{36}\\.(jpg|png|webp)$`,
          "i",
        );
        if (
          photo.storage_bucket !== "moderation-media"
          || typeof photo.storage_path !== "string"
          || !expectedPath.test(photo.storage_path)
        ) throw new Error("A pending profile photo has invalid private storage metadata.");
        const { data: signed, error: signedError } = await admin.storage
          .from("moderation-media")
          .createSignedUrl(photo.storage_path, 300);
        if (signedError || !signed?.signedUrl)
          throw signedError || new Error("Could not prepare a private profile photo preview.");
        return {
          id: photo.id,
          owner_phone: photo.owner_phone,
          display_name: photo.display_name,
          username: photo.username,
          gender: photo.gender,
          created_at: photo.created_at,
          decision_note: photo.decision_note,
          preview_url: signed.signedUrl,
        };
      }));
      return Response.json(
        { photos: reviews },
        { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
      );
    }

    if (action === "review-profile-photo") {
      const id = typeof body.id === "string" ? body.id : "";
      const decision = typeof body.decision === "string" ? body.decision : "";
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        || !["approved", "rejected"].includes(decision)
        || note.length < 1
        || note.length > 2000
      ) return Response.json(
        { error: "Choose a photo decision and add a review note (up to 2000 characters)." },
        { status: 400, headers: corsHeaders },
      );

      const { data: photo, error: photoError } = await admin
        .from("phone_content_moderation_items")
        .select("id,owner_phone,storage_bucket,storage_path,media_type,status,content_type")
        .eq("id", id)
        .maybeSingle();
      if (photoError) throw photoError;
      if (!photo) return Response.json(
        { error: "Profile photo review item was not found." },
        { status: 404, headers: corsHeaders },
      );

      const digits = photo.owner_phone.replace(/\D/g, "");
      const expectedPath = new RegExp(
        `^${digits}/[0-9a-f-]{36}\\.(jpg|png|webp)$`,
        "i",
      );
      const mediaType = typeof photo.media_type === "string"
        ? photo.media_type
        : fileTypeFromSuffix(photo.storage_path || "");
      if (
        photo.content_type !== "profile_photo"
        || photo.storage_bucket !== "moderation-media"
        || photo.status !== "needs_review"
        || typeof photo.storage_path !== "string"
        || !expectedPath.test(photo.storage_path)
        || !mediaType
        || !["image/jpeg", "image/png", "image/webp"].includes(mediaType)
      ) return Response.json(
        { error: "This profile photo is not awaiting review." },
        { status: 409, headers: corsHeaders },
      );

      let publicPhotoPath: string | null = null;
      let publicUrl: string | null = null;
      if (decision === "approved") {
        const { data: file, error: downloadError } = await admin.storage
          .from("moderation-media")
          .download(photo.storage_path);
        if (downloadError || !file)
          throw downloadError || new Error("The private profile photo could not be opened.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!hasValidFileSignature(bytes, mediaType))
          throw new Error("The stored profile photo does not match its image type.");
        publicPhotoPath = `${digits}/${crypto.randomUUID()}.${fileSuffix(mediaType)}`;
        const { error: uploadError } = await admin.storage
          .from("host-photos")
          .upload(publicPhotoPath, bytes, { contentType: mediaType, upsert: false });
        if (uploadError) throw uploadError;
        publicUrl = admin.storage.from("host-photos").getPublicUrl(publicPhotoPath).data.publicUrl;
      }

      const { data: review, error: reviewError } = await admin.rpc(
        "review_moderator_profile_photo",
        {
          input_item_id: id,
          input_actor_uid: identity.uid,
          input_decision: decision,
          input_review_note: note,
          input_public_photo_url: publicUrl,
        },
      );
      if (reviewError) {
        if (publicPhotoPath) {
          const { error: cleanupError } = await admin.storage
            .from("host-photos")
            .remove([publicPhotoPath]);
          if (cleanupError)
            console.error("Uncommitted profile photo cleanup failed:", cleanupError.message);
        }
        if (reviewError.code === "P0001" && reviewError.message === "profile_photo_superseded")
          return Response.json(
            { error: "A newer profile photo was submitted. Refresh the queue before reviewing this one." },
            { status: 409, headers: corsHeaders },
          );
        throw reviewError;
      }
      return Response.json(
        { ok: true, review },
        { headers: { ...corsHeaders, "Cache-Control": "no-store" } },
      );
    }

    if (action === "summary") {
      const { data, error } = await admin.rpc("get_moderator_ops_summary");
      if (error) throw error;
      return Response.json({ summary: data }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
    }

    if (action === "queue") {
      const { data, error } = await admin.from("safety_reports")
        .select("id,reporter_name,reported_user_id,reported_user_name,reason,details,status,resolution_note,created_at")
        .in("status", ["Open", "Under review"])
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return Response.json({ reports: (data || []).map((report) => ({
        ...report,
        priority: priority(report.reason || "", report.details || ""),
      })) }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
    }

    if (action === "report") {
      const reportId = typeof body.report_id === "string" ? body.report_id : "";
      const { data, error } = await admin.from("safety_reports")
        .select("id,reporter_name,reported_user_id,reported_user_name,reason,details,status,resolution_note,created_at")
        .eq("id", reportId).maybeSingle();
      if (error) throw error;
      if (!data)
        return Response.json({ error: "Report not found." }, { status: 404, headers: corsHeaders });
      return Response.json({ report: { ...data, priority: priority(data.reason || "", data.details || "") } }, { headers: corsHeaders });
    }

    if (action === "resolve") {
      const reportId = typeof body.report_id === "string" ? body.report_id : "";
      const status = typeof body.status === "string" ? body.status : "";
      const note = typeof body.resolution_note === "string" ? body.resolution_note.trim() : "";
      if (!reportId || !["Open", "Under review", "Resolved", "Rejected"].includes(status) || note.length > 2000)
        return Response.json({ error: "Invalid report update." }, { status: 400, headers: corsHeaders });
      const { data, error } = await admin.rpc("moderator_resolve_safety_report", {
        input_report_id: reportId,
        input_actor_uid: identity.uid,
        input_status: status,
        input_resolution_note: note,
      });
      if (error) throw error;
      return Response.json({ report: data }, { headers: corsHeaders });
    }

    return Response.json({ error: "Unsupported moderator action." }, { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error("Moderator operation failed:", error);
    const status = phoneAuthStatus(error);
    return Response.json(
      {
        error:
          status && error instanceof Error
            ? error.message
            : "Unable to load moderator data.",
      },
      { status: status ?? 500, headers: corsHeaders },
    );
  }
});