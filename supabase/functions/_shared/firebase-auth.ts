import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export async function verifyFirebasePhoneToken(token: string) {
  const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
  if (!projectId) throw new Error("Firebase project ID is not configured.");
  const { payload } = await jwtVerify(token, firebaseKeys, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  const phone = payload.phone_number;
  if (typeof phone !== "string" || !/^\+91\d{10}$/.test(phone))
    throw new Error("A verified Indian phone identity is required.");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Account status service is not configured.");
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: accountStatus, error: accountStatusError } = await admin
    .from("phone_user_admin_status")
    .select("status")
    .eq("phone", phone)
    .maybeSingle();
  if (accountStatusError) throw accountStatusError;
  if (accountStatus && accountStatus.status !== "active")
    throw new Error(accountStatus.status === "archived" ? "This account has been archived. Contact support to restore it." : "This account is inactive. Contact support for assistance.");
  return {
    phone,
    uid: payload.sub || "",
    moderator: payload.moderator === true,
  };
}
