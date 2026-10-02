import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebasePhoneToken } from "../_shared/firebase-auth.ts";

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
    const identity = await verifyFirebasePhoneToken(token);
    if (!identity.moderator)
      return Response.json({ error: "Moderator access is required." }, { status: 403, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!supabaseUrl || !serviceKey)
      return Response.json({ error: "Moderator service is not configured." }, { status: 503, headers: corsHeaders });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "";

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
    return Response.json({ error: "Unable to load moderator data." }, { status: 500, headers: corsHeaders });
  }
});