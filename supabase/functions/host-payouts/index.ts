import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebasePhoneToken } from "../_shared/firebase-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const accountNumberPattern = /^[0-9]{9,18}$/;
const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const upiPattern = /^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9._-]{1,64}$/;

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Unable to save payout destination. Please try again.";
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!url || !key) throw new Error("Payout service is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function maskedAccount(value: string) {
  return `•••• ${value.slice(-4)}`;
}

function maskedUpi(value: string) {
  const [local, handle] = value.split("@", 2);
  return `${local.slice(0, 2)}••••@${handle}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "POST required." }, 405);
  try {
    const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!token) return response({ error: "Please sign in to continue." }, 401);
    const identity = await verifyFirebasePhoneToken(token);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const admin = adminClient();
    const { data: host, error: hostError } = await admin
      .from("host_applications").select("status").eq("phone", identity.phone).maybeSingle();
    if (hostError) throw hostError;
    if (host?.status !== "approved") return response({ error: "Only approved Hosts can use withdrawals." }, 403);

    if (action === "status") {
      const [{ data: account, error: accountError }, { data: withdrawals, error: withdrawalsError }] = await Promise.all([
        admin.from("phone_host_payout_accounts").select("account_holder_name,account_number,ifsc_code,payout_method,upi_id,status,verification_note,updated_at").eq("host_phone", identity.phone).maybeSingle(),
        admin.from("phone_host_withdrawals").select("id,amount_paise,status,payout_reference,review_note,created_at").eq("host_phone", identity.phone).order("created_at", { ascending: false }).limit(12),
      ]);
      if (accountError || withdrawalsError) throw accountError || withdrawalsError;
      return response({
        payout_account: account ? {
          account_holder_name: account.account_holder_name,
          payout_method: account.payout_method === "upi" ? "upi" : "bank",
          masked_account_number: account.account_number ? maskedAccount(account.account_number) : null,
          ifsc_code: account.ifsc_code || null,
          masked_upi_id: account.upi_id ? maskedUpi(account.upi_id) : null,
          status: account.status,
          verification_note: account.verification_note,
          updated_at: account.updated_at,
        } : null,
        withdrawals: withdrawals || [],
      });
    }

    if (action === "save-account") {
      const accountHolderName = typeof body.account_holder_name === "string" ? body.account_holder_name.trim().replace(/\s+/g, " ") : "";
      const accountNumber = typeof body.account_number === "string" ? body.account_number.replace(/\s/g, "") : "";
      const ifscCode = typeof body.ifsc_code === "string" ? body.ifsc_code.trim().toUpperCase() : "";
      const payoutMethod = body.payout_method === "upi" ? "upi" : body.payout_method === "bank" ? "bank" : "";
      const upiId = typeof body.upi_id === "string" ? body.upi_id.trim().toLowerCase() : "";
      if (accountHolderName.length < 2 || accountHolderName.length > 120 || !payoutMethod)
        return response({ error: "Choose a payout method and enter the account holder name." }, 400);
      if (payoutMethod === "bank" && (!accountNumberPattern.test(accountNumber) || !ifscPattern.test(ifscCode)))
        return response({ error: "Enter a valid account number and IFSC code." }, 400);
      if (payoutMethod === "upi" && !upiPattern.test(upiId))
        return response({ error: "Enter a valid UPI ID, for example name@bank." }, 400);
      const { error } = await admin.from("phone_host_payout_accounts").upsert({
        host_phone: identity.phone, account_holder_name: accountHolderName, payout_method: payoutMethod,
        account_number: payoutMethod === "bank" ? accountNumber : null,
        ifsc_code: payoutMethod === "bank" ? ifscCode : null,
        upi_id: payoutMethod === "upi" ? upiId : null,
        status: "pending_verification", verification_note: null, verified_at: null, updated_at: new Date().toISOString(),
      }, { onConflict: "host_phone" });
      if (error) throw error;
      return response({ ok: true, status: "pending_verification" });
    }

    if (action === "request-withdrawal") {
      const amountPaise = typeof body.amount_paise === "number" && Number.isSafeInteger(body.amount_paise) ? body.amount_paise : 0;
      const { data, error } = await admin.rpc("request_phone_host_withdrawal", {
        input_phone: identity.phone, input_amount_paise: amountPaise,
      });
      if (error) return response({ error: error.message }, 400);
      return response({ withdrawal_id: data });
    }

    return response({ error: "Unsupported payout action." }, 400);
  } catch (error) {
    console.error("Host payout request failed:", error);
    return response({ error: errorMessage(error) }, 500);
  }
});
