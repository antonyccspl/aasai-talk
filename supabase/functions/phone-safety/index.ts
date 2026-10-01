import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebasePhoneToken } from "../_shared/firebase-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const phonePattern = /^\+91\d{10}$/;
const deletionReasons = new Set([
  "Asked for money",
  "Not interested",
  "Unable to hear",
  "Buddy not polite",
  "Abusive language",
  "Others",
]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return Response.json({ error: "POST required" }, { status: 405, headers: corsHeaders });

  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!token)
      return Response.json({ error: "Firebase sign-in is required." }, { status: 401, headers: corsHeaders });
    const identity = await verifyFirebasePhoneToken(token);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!supabaseUrl || !serviceKey)
      return Response.json({ error: "Safety service is not configured." }, { status: 503, headers: corsHeaders });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "list-blocks") {
      const { data, error } = await admin
        .from("phone_user_blocks")
        .select("blocked_phone")
        .eq("blocker_phone", identity.phone);
      if (error) throw error;
      return Response.json(
        { blocked_phones: (data || []).map((row) => row.blocked_phone) },
        { headers: corsHeaders },
      );
    }

    if (action === "block" || action === "unblock") {
      const targetPhone = typeof body.target_phone === "string" ? body.target_phone : "";
      if (!phonePattern.test(targetPhone) || targetPhone === identity.phone)
        return Response.json({ error: "Invalid person to block." }, { status: 400, headers: corsHeaders });
      if (action === "block") {
        const { error } = await admin.from("phone_user_blocks").upsert(
          { blocker_phone: identity.phone, blocked_phone: targetPhone },
          { onConflict: "blocker_phone,blocked_phone" },
        );
        if (error) throw error;
      } else {
        const { error } = await admin
          .from("phone_user_blocks")
          .delete()
          .eq("blocker_phone", identity.phone)
          .eq("blocked_phone", targetPhone);
        if (error) throw error;
      }
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (action === "report") {
      const targetPhone = typeof body.target_phone === "string" ? body.target_phone : "";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      const details = typeof body.details === "string" ? body.details.trim() : "";
      if (!phonePattern.test(targetPhone) || targetPhone === identity.phone || !reason || reason.length > 80 || details.length > 2000)
        return Response.json({ error: "Invalid report details." }, { status: 400, headers: corsHeaders });
      const [{ data: reporter }, { data: reported }, { data: host }] = await Promise.all([
        admin.from("phone_profiles").select("username").eq("phone", identity.phone).maybeSingle(),
        admin.from("phone_profiles").select("display_name").eq("phone", targetPhone).maybeSingle(),
        admin.from("host_applications").select("status,application_profile").eq("phone", targetPhone).maybeSingle(),
      ]);
      const hostName = host?.status === "approved" && typeof host.application_profile?.name === "string"
        ? host.application_profile.name
        : null;
      const { error } = await admin.from("safety_reports").insert({
        reporter_phone: identity.phone,
        reporter_name: reporter?.username ? `@${reporter.username}` : "Phone user",
        reported_user_id: `phone_${targetPhone.replace(/\D/g, "")}`,
        reported_user_name: hostName || reported?.display_name || "Unavailable profile",
        reason,
        details,
        status: "Open",
      });
      if (error) throw error;
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (action === "delete-request") {
      const reason = typeof body.reason === "string" ? body.reason : "";
      const details = typeof body.details === "string" ? body.details.trim() : "";
      if (!deletionReasons.has(reason) || details.length > 2000 || (reason === "Others" && !details))
        return Response.json({ error: "Invalid account-deletion request." }, { status: 400, headers: corsHeaders });
      const requestedAt = new Date();
      const scheduledFor = new Date(requestedAt.getTime() + 15 * 24 * 60 * 60 * 1000);
      const { error } = await admin.from("phone_account_deletion_requests").upsert({
        phone: identity.phone,
        reason,
        details,
        status: "pending",
        requested_at: requestedAt.toISOString(),
        scheduled_for: scheduledFor.toISOString(),
      });
      if (error) throw error;
      return Response.json({ scheduled_for: scheduledFor.toISOString() }, { headers: corsHeaders });
    }

    return Response.json({ error: "Unsupported safety action." }, { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error("Phone safety request failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Phone safety request failed." },
      { status: 401, headers: corsHeaders },
    );
  }
});