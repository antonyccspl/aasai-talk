import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export class PhoneSessionError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "PhoneSessionError";
  }
}

export function phoneAuthStatus(error: unknown) {
  return error instanceof PhoneSessionError ? error.status : null;
}

function normalizeIndianMobile(phone: string | null | undefined) {
  if (typeof phone !== "string") return null;
  const compactPhone = phone.trim().replace(/[\s()-]/g, "");
  const match = /^(?:\+?91)?(\d{10})$/.exec(compactPhone);
  return match ? `+91${match[1]}` : null;
}

export async function verifyPhoneSession(token: string) {
  const accessToken = token.trim();
  if (!accessToken)
    throw new PhoneSessionError(
      "A valid Supabase phone session is required.",
      401,
    );

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!supabaseUrl || !serviceRoleKey)
    throw new Error("Phone authentication service is not configured.");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? error.status
        : null;
    const name =
      typeof error === "object" && error !== null && "name" in error
        ? error.name
        : null;
    if (status === 401 || status === 403 || name === "AuthSessionMissingError")
      throw new PhoneSessionError(
        "A valid Supabase phone session is required.",
        401,
      );
    throw error;
  }

  const user = data.user;
  const phone = normalizeIndianMobile(user?.phone);
  if (!user || !phone)
    throw new PhoneSessionError(
      "A verified Indian phone identity is required.",
      401,
    );

  const { data: accountStatus, error: accountStatusError } = await admin
    .from("phone_user_admin_status")
    .select("status")
    .eq("phone", phone)
    .maybeSingle();
  if (accountStatusError) throw accountStatusError;
  if (accountStatus && accountStatus.status !== "active")
    throw new PhoneSessionError(
      accountStatus.status === "archived"
        ? "This account has been archived. Contact support to restore it."
        : "This account is inactive. Contact support for assistance.",
      403,
    );

  return { phone, uid: user.id };
}
