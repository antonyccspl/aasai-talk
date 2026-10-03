import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { ...headers, "Cache-Control": "no-store" } });
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!url || !key) throw new Error("Admin service is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function currentAdmin(request: Request) {
  const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!token) throw new Error("Admin sign-in is required.");
  const admin = serviceClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.email) throw new Error("Your admin session is invalid.");
  const email = data.user.email.toLowerCase();
  const bootstrapEmail = (Deno.env.get("ADMIN_BOOTSTRAP_EMAIL") || "").toLowerCase();
  if (bootstrapEmail && email === bootstrapEmail) {
    const { error: roleError } = await admin.from("admin_roles").upsert({ user_id: data.user.id, role: "super_admin", active: true }, { onConflict: "user_id" });
    if (roleError) throw roleError;
  }
  const { data: role, error: roleError } = await admin.from("admin_roles")
    .select("role,active").eq("user_id", data.user.id).maybeSingle();
  if (roleError) throw roleError;
  if (!role?.active) throw new Error("This account is not authorised for the admin portal.");
  return { admin, user: data.user, role: role.role as string };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply({ error: "POST required." }, 405);
  try {
    const { user, role } = await currentAdmin(request);
    return reply({ admin: { id: user.id, email: user.email, role } });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Admin access failed." }, 403);
  }
});
