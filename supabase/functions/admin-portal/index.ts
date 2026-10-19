import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scanImageWithGoogleVision } from "../_shared/image-moderation.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const defaultPages: Record<string, string[]> = {
  super_admin: ["Overview", "Performance", "Hosts", "Payouts", "Payments", "Users", "Reports", "Support", "Coin packs", "Admin access", "Audit log"],
  finance_admin: ["Overview", "Payouts", "Payments", "Coin packs"],
  moderator: ["Overview", "Hosts", "Users", "Reports", "Support"],
  support: ["Overview", "Users", "Support"],
};

function pageAccessFor(role: string, requested: unknown) {
  const allowed = defaultPages[role] || [];
  if (role === "super_admin") return allowed;
  if (!Array.isArray(requested)) return allowed;
  const normalized = requested.map((page) => page === "Safety" ? "Reports" : page);
  const pages = [...new Set(normalized.filter((page): page is string => typeof page === "string" && allowed.includes(page)))];
  return pages.length ? pages : allowed;
}

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { ...headers, "Cache-Control": "no-store" } });
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.trim()) return error.message;
  return "Admin access failed.";
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
    .select("role,active,page_access").eq("user_id", data.user.id).maybeSingle();
  if (roleError) throw roleError;
  if (!role?.active) throw new Error("This account is not authorised for the admin portal.");
  return { admin, user: data.user, role: role.role as string, pages: pageAccessFor(role.role, role.page_access) };
}

function requireSuperAdmin(role: string) {
  if (role !== "super_admin") throw new Error("Only a Super Admin can manage administrator access.");
}
function requireRole(role: string, allowed: string[]) { if (!allowed.includes(role)) throw new Error("Your admin role cannot access this workspace."); }
function requirePage(pages: string[], page: string) { if (!pages.includes(page)) throw new Error("Your administrator access does not include this page."); }

async function listAdminAccounts(admin: ReturnType<typeof serviceClient>) {
  const [{ data: users, error: usersError }, { data: roles, error: rolesError }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("admin_roles").select("user_id,role,active,page_access,updated_at"),
  ]);
  if (usersError) throw usersError;
  if (rolesError) throw rolesError;
  const rolesById = new Map((roles || []).map((role) => [role.user_id, role]));
  return users.users.map((user) => {
    const role = rolesById.get(user.id);
    return { id: user.id, email: user.email, created_at: user.created_at, email_confirmed_at: user.email_confirmed_at, role: role?.role || null, active: role?.active ?? false, page_access: role ? pageAccessFor(role.role, role.page_access) : [] };
  }).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

const hostImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const hostDocumentTypes = new Set([
  ...hostImageTypes,
  "application/pdf",
]);

function fileSuffix(type: string) {
  switch (type) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "application/pdf": return "pdf";
    default: throw new Error("This file type is not supported.");
  }
}

function hasValidFileSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.subarray(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  if (type === "image/webp")
    return new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF"
      && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
  if (type === "application/pdf")
    return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  return false;
}

function asStringArray(value: unknown, maximum: number, label: string) {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error(`Choose no more than ${maximum} ${label}.`);
  const strings = value.filter((item): item is string => typeof item === "string");
  if (strings.length !== value.length) throw new Error(`Invalid ${label}.`);
  const values = [...new Set(strings.map((item) => item.trim()))];
  if (values.length !== value.length || values.some((item) => item.length < 1 || item.length > 40))
    throw new Error(`Remove empty or duplicate ${label}.`);
  return values;
}

function isAdultDateOfBirth(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const adultCutoff = new Date();
  adultCutoff.setUTCHours(0, 0, 0, 0);
  adultCutoff.setUTCFullYear(adultCutoff.getUTCFullYear() - 18);
  return date <= adultCutoff;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply({ error: "POST required." }, 405);
  try {
    const { admin, user, role, pages } = await currentAdmin(request);
    let uploadForm: FormData | null = null;
    let body: Record<string, unknown> = {};
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      uploadForm = await request.formData();
      const payload = uploadForm.get("payload");
      if (typeof payload !== "string") throw new Error("Missing Host enrollment details.");
      const parsed = JSON.parse(payload);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Invalid Host enrollment details.");
      body = parsed as Record<string, unknown>;
    } else {
      const parsed = await request.json().catch(() => ({}));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        body = parsed as Record<string, unknown>;
    }
    const action = typeof body.action === "string" ? body.action : "me";
    if (action === "create_instagram_host") {
      requireSuperAdmin(role);
      requirePage(pages, "Hosts");
      if (!uploadForm) throw new Error("Host photos and verification documents are required.");

      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const dateOfBirth = typeof body.date_of_birth === "string" ? body.date_of_birth : "";
      const city = typeof body.city === "string" ? body.city.trim().replace(/\s+/g, " ") : "";
      const bio = typeof body.bio === "string" ? body.bio.trim() : "";
      const languages = asStringArray(body.languages, 4, "languages");
      const interests = asStringArray(body.interests, 6, "interests");
      const audio = body.audio === true;
      const video = body.video === true;
      const pan = typeof body.pan_number === "string" ? body.pan_number.trim().toUpperCase() : "";
      const aadhaar = typeof body.aadhaar_number === "string" ? body.aadhaar_number.replace(/\s/g, "") : "";
      const holder = typeof body.account_holder_name === "string" ? body.account_holder_name.trim().replace(/\s+/g, " ") : "";
      const method = body.payout_method === "upi" || body.payout_method === "bank" ? body.payout_method : "";
      const upi = typeof body.upi_id === "string" ? body.upi_id.trim().toLowerCase() : "";
      const accountNumber = typeof body.account_number === "string" ? body.account_number.replace(/\s/g, "") : "";
      const ifsc = typeof body.ifsc_code === "string" ? body.ifsc_code.trim().toUpperCase() : "";
      const approve = body.approve === true;
      const payoutVerified = body.payout_verified === true;
      const attested = body.admin_identity_consent_attested === true;
      const photoSafetyAttested = body.admin_photo_safety_attested === true;
      const photo = uploadForm.get("photo");
      const aadhaarFile = uploadForm.get("aadhaar_file");
      const panFile = uploadForm.get("pan_file");

      if (!/^\+91\d{10}$/.test(phone)) throw new Error("Enter a valid Indian mobile number.");
      if (name.length < 2 || name.length > 50) throw new Error("Enter a name between 2 and 50 characters.");
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) throw new Error("Use a username with 3–20 letters, numbers, or underscores.");
      if (!isAdultDateOfBirth(dateOfBirth)) throw new Error("The Host must be at least 18 years old. Check the date of birth.");
      if (city.length < 2 || city.length > 80) throw new Error("Enter a city between 2 and 80 characters.");
      if (bio.length < 12 || bio.length > 500) throw new Error("Enter a Host bio between 12 and 500 characters.");
      if (languages.length < 1 || interests.length < 1) throw new Error("Select at least one language and one interest.");
      if (!audio && !video) throw new Error("Enable at least one call preference.");
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) || !/^\d{12}$/.test(aadhaar))
        throw new Error("Enter a valid PAN and 12-digit Aadhaar number.");
      if (!attested)
        throw new Error("Confirm that you personally verified the phone number, adult identity, and the woman's consent.");
      if (!photoSafetyAttested)
        throw new Error("Confirm that you reviewed the profile photo against the Host photo-safety rules.");
      if (!method || holder.length < 2 || holder.length > 120)
        throw new Error("Enter a payout method and the account holder's name.");
      if (method === "upi" && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9._-]{1,64}$/.test(upi))
        throw new Error("Enter a valid UPI ID.");
      if (method === "bank" && (!/^\d{9,18}$/.test(accountNumber) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)))
        throw new Error("Enter a valid bank account number and IFSC code.");
      if (!(photo instanceof File) || photo.size < 1 || photo.size > 5 * 1024 * 1024 || !hostImageTypes.has(photo.type))
        throw new Error("Choose a JPG, PNG, or WEBP Host photo smaller than 5 MB.");
      if (!(aadhaarFile instanceof File) || aadhaarFile.size < 1 || aadhaarFile.size > 10 * 1024 * 1024 || !hostDocumentTypes.has(aadhaarFile.type))
        throw new Error("Choose an Aadhaar image or PDF smaller than 10 MB.");
      if (!(panFile instanceof File) || panFile.size < 1 || panFile.size > 10 * 1024 * 1024 || !hostDocumentTypes.has(panFile.type))
        throw new Error("Choose a PAN image or PDF smaller than 10 MB.");

      const [{ data: existingProfile, error: profileLookupError }, { data: existingApplication, error: applicationLookupError }, { data: matchingUsername, error: usernameLookupError }] = await Promise.all([
        admin.from("phone_profiles").select("phone").eq("phone", phone).maybeSingle(),
        admin.from("host_applications").select("id").eq("phone", phone).maybeSingle(),
        admin.from("phone_profiles").select("phone").ilike("username", username).limit(1).maybeSingle(),
      ]);
      if (profileLookupError || applicationLookupError || usernameLookupError)
        throw profileLookupError || applicationLookupError || usernameLookupError;
      if (existingProfile || existingApplication)
        throw new Error("This phone already belongs to an app member or Host application. Use assisted setup instead.");
      if (matchingUsername)
        throw new Error("That username is already in use.");

      const uploadedDocuments: string[] = [];
      let publicPhotoPath = "";
      let moderationMediaPath = "";
      let moderationItemId = "";
      let scanWasApproved = false;
      try {
        const photoBytes = new Uint8Array(await photo.arrayBuffer());
        if (!hasValidFileSignature(photoBytes, photo.type))
          throw new Error("The Host photo file does not match its selected image type.");
        const scan = await scanImageWithGoogleVision(photoBytes);
        const manualPhotoApproval = scan.status === "needs_review";
        moderationMediaPath = `${phone.replace(/\D/g, "")}/${crypto.randomUUID()}.${fileSuffix(photo.type)}`;
        const moderationUpload = await admin.storage.from("moderation-media").upload(moderationMediaPath, photoBytes, {
          contentType: photo.type,
          upsert: false,
        });
        if (moderationUpload.error) throw moderationUpload.error;
        const { data: moderationItem, error: moderationInsertError } = await admin.from("phone_content_moderation_items").insert({
          owner_phone: phone,
          content_type: "profile_photo",
          storage_bucket: "moderation-media",
          storage_path: moderationMediaPath,
          scan_provider: manualPhotoApproval ? "admin_manual" : scan.provider,
          adult_likelihood: scan.adult,
          racy_likelihood: scan.racy,
          provider_result: manualPhotoApproval
            ? { automatic_scan: scan.result, manually_reviewed: true }
            : scan.result,
          status: manualPhotoApproval ? "approved" : scan.status,
          decision_note: scan.status === "rejected"
            ? "Rejected by the automatic photo safety scan."
            : manualPhotoApproval
              ? "Manually approved by a Super Admin during Instagram Host onboarding."
              : "Automatically approved.",
          reviewed_by: manualPhotoApproval ? user.id : null,
          reviewed_at: manualPhotoApproval ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }).select("id").single();
        if (moderationInsertError) throw moderationInsertError;
        moderationItemId = moderationItem.id;
        if (scan.status === "rejected")
          throw new Error("The photo was rejected by the safety check. Choose a different photo.");

        const publicPhotoName = `${phone.replace(/\D/g, "")}/${crypto.randomUUID()}.${fileSuffix(photo.type)}`;
        const photoUpload = await admin.storage.from("host-photos").upload(publicPhotoName, photoBytes, {
          contentType: photo.type,
          upsert: false,
        });
        if (photoUpload.error) throw photoUpload.error;
        publicPhotoPath = publicPhotoName;
        const photoUrl = admin.storage.from("host-photos").getPublicUrl(publicPhotoPath).data.publicUrl;
        const { error: moderationUpdateError } = await admin.from("phone_content_moderation_items")
          .update({ public_url: photoUrl, updated_at: new Date().toISOString() }).eq("id", moderationItemId);
        if (moderationUpdateError) throw moderationUpdateError;
        scanWasApproved = true;

        const uploadDocument = async (file: File, kind: "aadhaar" | "pan") => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!hasValidFileSignature(bytes, file.type))
            throw new Error(`The ${kind.toUpperCase()} file does not match its selected document type.`);
          const path = `${phone.replace(/\D/g, "")}/${kind}-${crypto.randomUUID()}.${fileSuffix(file.type)}`;
          const result = await admin.storage.from("host-verification").upload(path, bytes, {
            contentType: file.type,
            upsert: false,
          });
          if (result.error) throw result.error;
          uploadedDocuments.push(path);
          return path;
        };
        const aadhaarPath = await uploadDocument(aadhaarFile, "aadhaar");
        const panPath = await uploadDocument(panFile, "pan");
        const profile = {
          gender: "Female",
          name,
          username,
          dob: dateOfBirth,
          date_of_birth: dateOfBirth,
          city,
          languages,
          interests,
          bio,
          photo: photoUrl,
          guidelinesAccepted: true,
          adultAgeConfirmed: true,
          adminInstagramOnboarding: true,
        };
        const application = {
          name,
          bio,
          languages,
          interests,
          photo: photoUrl,
          audio,
          video,
          audioRate: "2",
          videoRate: "5",
          aadhaarDocument: "Verified by admin",
          panDocument: "Verified by admin",
          aadhaarPath,
          panPath,
          source: "instagram",
          photoSafetyAdminChecked: photoSafetyAttested,
        };
        const { data: applicationId, error: createError } = await admin.rpc("admin_create_instagram_host", {
          input_phone: phone,
          input_profile: profile,
          input_application: application,
          input_aadhaar_path: aadhaarPath,
          input_pan_path: panPath,
          input_pan_last4: pan.slice(-4),
          input_aadhaar_last4: aadhaar.slice(-4),
          input_payout: {
            payout_method: method,
            account_holder_name: holder,
            account_number: method === "bank" ? accountNumber : null,
            ifsc_code: method === "bank" ? ifsc : null,
            upi_id: method === "upi" ? upi : null,
          },
          input_admin_user_id: user.id,
          input_approve: approve,
          input_payout_verified: payoutVerified,
        });
        if (createError) throw createError;
        return reply({ ok: true, application_id: applicationId });
      } catch (error) {
        const cleanupErrors: string[] = [];
        if (uploadedDocuments.length) {
          const { error: cleanupError } = await admin.storage.from("host-verification").remove(uploadedDocuments);
          if (cleanupError) cleanupErrors.push(cleanupError.message);
        }
        if (publicPhotoPath) {
          const { error: cleanupError } = await admin.storage.from("host-photos").remove([publicPhotoPath]);
          if (cleanupError) cleanupErrors.push(cleanupError.message);
        }
        if (moderationMediaPath && moderationItemId && !publicPhotoPath) {
          // Keep photos awaiting a manual safety review in the moderation queue.
        } else if (moderationMediaPath && moderationItemId && scanWasApproved && publicPhotoPath) {
          const { error: itemError } = await admin.from("phone_content_moderation_items")
            .update({ public_url: null, decision_note: "Safety scan passed; enrollment did not complete.", updated_at: new Date().toISOString() })
            .eq("id", moderationItemId);
          if (itemError) cleanupErrors.push(itemError.message);
        } else if (moderationMediaPath && !moderationItemId) {
          const { error: cleanupError } = await admin.storage.from("moderation-media").remove([moderationMediaPath]);
          if (cleanupError) cleanupErrors.push(cleanupError.message);
        }
        if (cleanupErrors.length)
          console.error("Instagram Host upload cleanup failed:", cleanupErrors);
        throw error;
      }
    }
    if (action === "list_admin_accounts") {
      requireSuperAdmin(role);
      requirePage(pages, "Admin access");
      return reply({ accounts: await listAdminAccounts(admin) });
    }
    if (action === "assign_admin_role") {
      requireSuperAdmin(role);
      requirePage(pages, "Admin access");
      const targetUserId = typeof body.user_id === "string" ? body.user_id : "";
      const assignedRole = typeof body.role === "string" ? body.role : "";
      const active = typeof body.active === "boolean" ? body.active : true;
      if (!targetUserId || !["finance_admin", "moderator", "support"].includes(assignedRole)) throw new Error("Choose Finance Admin, Moderator, or Support for the selected account.");
      if (targetUserId === user.id) throw new Error("The bootstrap Super Admin role cannot be changed here.");
      const pageAccess = pageAccessFor(assignedRole, body.page_access);
      const { data: before } = await admin.from("admin_roles").select("role,active,page_access").eq("user_id", targetUserId).maybeSingle();
      const { error: updateError } = await admin.from("admin_roles").upsert({ user_id: targetUserId, role: assignedRole, active, page_access: pageAccess, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (updateError) throw updateError;
      const { error: auditError } = await admin.from("admin_audit_logs").insert({ admin_user_id: user.id, action: "admin_role_assigned", entity_type: "admin_account", entity_id: targetUserId, before_state: before, after_state: { role: assignedRole, active, page_access: pageAccess } });
      if (auditError) throw auditError;
      return reply({ ok: true, accounts: await listAdminAccounts(admin) });
    }
    if (action === "create_admin_account") {
      requireSuperAdmin(role);
      requirePage(pages, "Admin access");
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const assignedRole = typeof body.role === "string" ? body.role : "";
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid staff email address.");
      if (password.length < 8) throw new Error("Use a temporary password of at least 8 characters.");
      if (!["finance_admin", "moderator", "support"].includes(assignedRole)) throw new Error("Choose Finance Admin, Moderator, or Support.");
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (createError || !created.user) throw createError || new Error("Unable to create the staff account.");
      const pageAccess = pageAccessFor(assignedRole, body.page_access);
      const { error: roleError } = await admin.from("admin_roles").insert({ user_id: created.user.id, role: assignedRole, active: true, page_access: pageAccess, updated_by: user.id });
      if (roleError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw roleError;
      }
      const { error: auditError } = await admin.from("admin_audit_logs").insert({ admin_user_id: user.id, action: "admin_account_created", entity_type: "admin_account", entity_id: created.user.id, after_state: { email, role: assignedRole, active: true, page_access: pageAccess } });
      if (auditError) throw auditError;
      return reply({ ok: true, accounts: await listAdminAccounts(admin) });
    }
    if (action === "list_hosts") {
      requireRole(role, ["super_admin", "moderator"]); requirePage(pages, "Hosts");
      const [{ data: profiles, error: profileError }, { data: applications, error: applicationError }] = await Promise.all([
        admin.from("phone_profiles").select("phone,display_name,username,gender,date_of_birth,city,bio,languages,interests,avatar_url,created_at,updated_at").eq("gender", "Female").order("created_at", { ascending: false }).limit(250),
        admin.from("host_applications").select("id,phone,status,application_profile,aadhaar_path,pan_path,submitted_at,reviewed_at,review_note").limit(250),
      ]); if (profileError || applicationError) throw profileError || applicationError;
      const phones=(profiles||[]).map((profile)=>profile.phone); const [{data:accounts,error:accountError},{data:compliance,error:complianceError}]=await Promise.all([
        phones.length?admin.from("phone_host_payout_accounts").select("host_phone,account_holder_name,payout_method,account_number,ifsc_code,upi_id,status,verification_note,verified_at,updated_at").in("host_phone",phones):Promise.resolve({data:[],error:null}),
        phones.length?admin.from("phone_host_compliance").select("host_phone,pan_last4,aadhaar_last4,pan_verified,aadhaar_verified,verified_at,updated_at").in("host_phone",phones):Promise.resolve({data:[],error:null}),
      ]); if(accountError||complianceError) throw accountError||complianceError;
      const {data:presence,error:presenceError}=phones.length?await admin.from("phone_host_presence").select("host_phone,last_seen_at").in("host_phone",phones):{data:[],error:null};if(presenceError)throw presenceError;
      const applicationsByPhone=new Map((applications||[]).map((application)=>[application.phone,application])); const accountsByPhone=new Map((accounts||[]).map((account)=>[account.host_phone,account])); const complianceByPhone=new Map((compliance||[]).map((record)=>[record.host_phone,record])); const presenceByPhone=new Map((presence||[]).map((record)=>[record.host_phone,record.last_seen_at])); const today=Date.now()-86400000; const onlineThreshold=Date.now()-60000;
      return reply({items:(profiles||[]).map((profile)=>{const application=applicationsByPhone.get(profile.phone);const lastSeenAt=presenceByPhone.get(profile.phone)||null;return {...(application||{id:`lead:${profile.phone}`,phone:profile.phone,status:"new",submitted_at:profile.created_at,application_profile:{}}),profile,bank_account:accountsByPhone.get(profile.phone)||null,compliance:complianceByPhone.get(profile.phone)||null,is_new:Date.parse(profile.created_at)>=today,last_seen_at:lastSeenAt,is_online:application?.status==="approved"&&!!lastSeenAt&&Date.parse(lastSeenAt)>=onlineThreshold};})});
    }
    if (action === "performance_reports") {
      requireSuperAdmin(role); requirePage(pages, "Performance");
      const start = typeof body.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date) ? `${body.start_date}T00:00:00.000Z` : "";
      const end = typeof body.end_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.end_date) ? `${body.end_date}T23:59:59.999Z` : "";
      if ((start && !end) || (!start && end) || (start && end && start > end)) throw new Error("Choose a valid report date range.");
      const days = [7,30,90].includes(Number(body.days)) ? Number(body.days) : 30;
      const since = body.all_time === true ? "" : start || new Date(Date.now() - days * 86400000).toISOString();
      const apply = <T>(query: T & { gte:(column:string,value:string)=>T; lte:(column:string,value:string)=>T }) => { let scoped=query; if(since) scoped=scoped.gte("created_at",since); if(end) scoped=scoped.lte("created_at",end); return scoped; };
      const [{data:calls,error:callError},{data:legacyLedger,error:legacyLedgerError},{data:minuteCharges,error:minuteChargesError},{data:modeSwitchCharges,error:modeSwitchChargesError},{data:hostEarnings,error:hostEarningsError},{data:profiles,error:profileError},{data:payments,error:paymentError},{data:payouts,error:payoutError},{data:reports,error:reportError}] = await Promise.all([
        apply(admin.from("call_sessions").select("id,caller_phone,host_phone,call_type,status,duration_seconds,created_at")),
        apply(admin.from("phone_wallet_ledger").select("phone,call_session_id,coin_delta,earnings_delta_paise,created_at")),
        apply(admin.from("phone_call_minute_ledger").select("phone,call_session_id,coin_delta,created_at")),
        apply(admin.from("phone_call_mode_switch_ledger").select("phone,call_session_id,coin_delta,created_at")),
        apply(admin.from("phone_host_earnings_ledger").select("host_phone,earnings_paise,created_at")),
        admin.from("phone_profiles").select("phone,display_name,username,avatar_url,gender"),
        apply(admin.from("phone_payment_orders").select("id,phone,coins,status,amount_paise,provider_payment_id,created_at,captured_at,credited_at")),
        apply(admin.from("phone_host_withdrawals").select("id,host_phone,status,amount_paise,payout_reference,review_note,created_at,updated_at")),
        apply(admin.from("safety_reports").select("id,reporter_name,reported_user_name,reason,status,resolution_note,created_at")),
      ]);
      if(callError||legacyLedgerError||minuteChargesError||modeSwitchChargesError||hostEarningsError||profileError||paymentError||payoutError||reportError) throw callError||legacyLedgerError||minuteChargesError||modeSwitchChargesError||hostEarningsError||profileError||paymentError||payoutError||reportError;
      const byPhone = new Map((profiles||[]).map((profile)=>[profile.phone,profile]));
      const hosts = new Map<string,{phone:string;talk_seconds:number;earned_paise:number;calls:number;audio_calls:number;video_calls:number}>();
      const users = new Map<string,{phone:string;talk_seconds:number;spent_coins:number;calls:number;audio_calls:number;video_calls:number}>();
      for (const call of calls||[]) { const seconds=Math.max(0,Number(call.duration_seconds||0)); const host=hosts.get(call.host_phone)||{phone:call.host_phone,talk_seconds:0,earned_paise:0,calls:0,audio_calls:0,video_calls:0}; host.talk_seconds+=seconds;host.calls+=1;if(call.call_type==="audio")host.audio_calls+=1;else host.video_calls+=1;hosts.set(call.host_phone,host); const caller=users.get(call.caller_phone)||{phone:call.caller_phone,talk_seconds:0,spent_coins:0,calls:0,audio_calls:0,video_calls:0};caller.talk_seconds+=seconds;caller.calls+=1;if(call.call_type==="audio")caller.audio_calls+=1;else caller.video_calls+=1;users.set(call.caller_phone,caller); }
      // New calls charge each billable minute (and a video upgrade) immediately.  Older
      // sessions have one settlement row instead.  Prefer the current charge ledgers
      // and only retain a legacy settlement when that session has no current charges.
      const currentChargeSessions = new Set<string>();
      const addCurrentCharge = (row:{phone:string;call_session_id:string|null;coin_delta:number|null}) => {
        if (row.call_session_id) currentChargeSessions.add(`${row.phone}:${row.call_session_id}`);
        const user=users.get(row.phone); if(user) user.spent_coins+=Math.max(0,-Number(row.coin_delta||0));
      };
      for (const row of minuteCharges||[]) addCurrentCharge(row);
      for (const row of modeSwitchCharges||[]) addCurrentCharge(row);
      for (const row of legacyLedger||[]) {
        const key=row.call_session_id ? `${row.phone}:${row.call_session_id}` : "";
        if (!key || !currentChargeSessions.has(key)) { const user=users.get(row.phone); if(user) user.spent_coins+=Math.max(0,-Number(row.coin_delta||0)); }
      }
      for (const row of hostEarnings||[]) { const host=hosts.get(row.host_phone); if(host) host.earned_paise+=Number(row.earnings_paise||0); }
      const decorate=(record:{phone:string;talk_seconds?:number})=>({...record,talk_seconds:Math.max(0,Number(record.talk_seconds||0)),profile:byPhone.get(record.phone)||null});
      const totalSeconds=(calls||[]).reduce((total,call)=>total+Math.max(0,Number(call.duration_seconds||0)),0); const completedCalls=(calls||[]).filter((call)=>call.status==="ended" && Number(call.duration_seconds||0)>0).length; const audioCalls=(calls||[]).filter((call)=>call.call_type==="audio").length; const videoCalls=(calls||[]).filter((call)=>call.call_type==="video").length;
      const capturedPayments=(payments||[]).filter((payment)=>payment.status==="captured"); const failedPayments=(payments||[]).filter((payment)=>payment.status==="failed");
      const pendingPayouts=(payouts||[]).filter((payout)=>["pending","in_review","processing"].includes(String(payout.status))); const completedPayouts=(payouts||[]).filter((payout)=>payout.status==="completed"); const rejectedPayouts=(payouts||[]).filter((payout)=>["rejected","failed"].includes(String(payout.status))); const openReports=(reports||[]).filter((report)=>["Open","Under review"].includes(String(report.status))); const resolvedReports=(reports||[]).filter((report)=>report.status==="Resolved");
      const newest = <T extends { created_at:string }>(items:T[]) => [...items].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,12);
      return reply({hosts:[...hosts.values()].map(decorate).sort((a,b)=>b.earned_paise-a.earned_paise),users:[...users.values()].map(decorate).sort((a,b)=>b.spent_coins-a.spent_coins),payments:newest(payments||[]),payouts:newest(payouts||[]),reports:newest(reports||[]),summary:{calls_total:(calls||[]).length,calls_completed:completedCalls,call_seconds:totalSeconds,average_call_seconds:completedCalls?totalSeconds/completedCalls:0,audio_calls:audioCalls,video_calls:videoCalls,active_hosts:hosts.size,active_users:users.size,host_earnings_paise:[...hosts.values()].reduce((total,host)=>total+host.earned_paise,0),user_spent_coins:[...users.values()].reduce((total,user)=>total+user.spent_coins,0),payments_captured:capturedPayments.length,payments_failed:failedPayments.length,payment_revenue_paise:capturedPayments.reduce((total,payment)=>total+Number(payment.amount_paise||0),0),payouts_pending:pendingPayouts.length,payouts_pending_paise:pendingPayouts.reduce((total,payout)=>total+Number(payout.amount_paise||0),0),payouts_completed:completedPayouts.length,payouts_completed_paise:completedPayouts.reduce((total,payout)=>total+Number(payout.amount_paise||0),0),payouts_rejected:rejectedPayouts.length,reports_open:openReports.length,reports_resolved:resolvedReports.length},range:{all_time:body.all_time===true,start:start||null,end:end||null,days}});
    }
    if (action === "admin_search") {
      const query = typeof body.query === "string" ? body.query.trim() : "";
      if (query.length < 2) return reply({ items: [] });
      const pattern = `%${query.replace(/[%_,]/g, "")}%`;
      const { data: profiles, error: profileError } = await admin.from("phone_profiles").select("phone,display_name,username").or(`phone.ilike.${pattern},display_name.ilike.${pattern},username.ilike.${pattern}`).limit(12);
      if (profileError) throw profileError;
      const phones = (profiles || []).map((profile) => profile.phone);
      const items: Record<string, unknown>[] = [];
      if (pages.includes("Users")) for (const profile of profiles || []) items.push({ kind:"User", section:"Users", query:profile.phone, title:profile.display_name || profile.username || profile.phone, subtitle:profile.phone });
      if (pages.includes("Hosts") && phones.length) { const {data:hosts,error}=await admin.from("host_applications").select("phone,status").in("phone",phones).limit(12);if(error)throw error;for(const host of hosts||[]){const profile=(profiles||[]).find((value)=>value.phone===host.phone);items.push({kind:"Host",section:"Hosts",query:host.phone,title:profile?.display_name||host.phone,subtitle:`${host.status} Host · ${host.phone}`});} }
      if (pages.includes("Payouts") && phones.length) { const {data:payouts,error}=await admin.from("phone_host_withdrawals").select("host_phone,amount_paise,status").in("host_phone",phones).order("created_at",{ascending:false}).limit(12);if(error)throw error;for(const payout of payouts||[]){const profile=(profiles||[]).find((value)=>value.phone===payout.host_phone);items.push({kind:"Payout",section:"Payouts",query:payout.host_phone,title:profile?.display_name||payout.host_phone,subtitle:`₹${Number(payout.amount_paise||0)/100} · ${payout.status}`});} }
      if (pages.includes("Payments") && phones.length) { const {data:payments,error}=await admin.from("phone_payment_orders").select("phone,amount_paise,status").in("phone",phones).order("created_at",{ascending:false}).limit(12);if(error)throw error;for(const payment of payments||[]){const profile=(profiles||[]).find((value)=>value.phone===payment.phone);items.push({kind:"Payment",section:"Payments",query:payment.phone,title:profile?.display_name||payment.phone,subtitle:`₹${Number(payment.amount_paise||0)/100} · ${payment.status}`});} }
      if (pages.includes("Reports")) { const {data:reports,error}=await admin.from("safety_reports").select("id,reported_user_name,reported_user_id,reason,status").or(`reported_user_name.ilike.${pattern},reported_user_id.ilike.${pattern}`).limit(12);if(error)throw error;for(const report of reports||[])items.push({kind:"Report",section:"Reports",query:report.reported_user_name||report.reported_user_id,title:report.reported_user_name||"Safety report",subtitle:`${report.reason} · ${report.status}`}); }
      return reply({ items: items.slice(0, 18) });
    }
    if (action === "assist_host_onboarding") {
      requireSuperAdmin(role); requirePage(pages, "Hosts");
      const phone=typeof body.phone === "string"?body.phone:""; const holder=typeof body.account_holder_name === "string"?body.account_holder_name.trim().replace(/\s+/g," "):""; const method=body.payout_method === "upi" ? "upi" : body.payout_method === "bank" ? "bank" : ""; const upi=typeof body.upi_id === "string"?body.upi_id.trim().toLowerCase():""; const account=typeof body.account_number === "string"?body.account_number.replace(/\s/g,""):""; const ifsc=typeof body.ifsc_code === "string"?body.ifsc_code.trim().toUpperCase():""; const pan=typeof body.pan_number === "string"?body.pan_number.trim().toUpperCase():""; const aadhaar=typeof body.aadhaar_number === "string"?body.aadhaar_number.replace(/\s/g,""):""; const approve=body.approve === true; const payoutVerified=body.payout_verified === true;
      if(!/^\+91\d{10}$/.test(phone)) throw new Error("Choose a valid female member."); const {data:profile,error:profileError}=await admin.from("phone_profiles").select("phone,display_name,username,gender,bio,languages,interests,avatar_url").eq("phone",phone).maybeSingle(); if(profileError||!profile||profile.gender!=="Female") throw profileError||new Error("Only female members can be enrolled as Hosts.");
      if(!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)||!/^\d{12}$/.test(aadhaar)) throw new Error("Enter a valid PAN and 12-digit Aadhaar number.");
      if(method && (holder.length<2||holder.length>120)) throw new Error("Enter the payout account holder name.");
      if(method === "upi" && !/^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9._-]{1,64}$/.test(upi)) throw new Error("Enter a valid UPI ID.");
      if(method === "bank" && (!/^\d{9,18}$/.test(account)||!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))) throw new Error("Enter a valid bank account number and IFSC.");
      if(!method) throw new Error("Choose a UPI ID or bank account for payouts.");
      const now=new Date().toISOString(); const {data:existing,error:existingError}=await admin.from("host_applications").select("id,application_profile").eq("phone",phone).maybeSingle(); if(existingError) throw existingError; const existingProfile=existing?.application_profile&&typeof existing.application_profile==="object"?existing.application_profile:{}; const applicationProfile={...existingProfile,name:profile.display_name||"Host",bio:profile.bio||"",languages:profile.languages||[],interests:profile.interests||[],photo:profile.avatar_url||null,aadhaarDocument:"Verified by admin",panDocument:"Verified by admin",audio:true,video:true,audioRate:"2",videoRate:"5"};
      const applicationChanges={status:approve?"approved":"pending",application_profile:applicationProfile,reviewed_at:approve?now:null,review_note:approve?"Approved after assisted onboarding.":null}; const applicationResult=existing?.id?await admin.from("host_applications").update(applicationChanges).eq("id",existing.id):await admin.from("host_applications").insert({...applicationChanges,phone,submitted_at:now}); if(applicationResult.error) throw applicationResult.error;
      const {error:complianceInsertError}=await admin.from("phone_host_compliance").upsert({host_phone:phone,pan_last4:pan.slice(-4),aadhaar_last4:aadhaar.slice(-4),pan_verified:true,aadhaar_verified:true,verified_by:user.id,verified_at:now,updated_at:now},{onConflict:"host_phone"}); if(complianceInsertError) throw complianceInsertError;
      const {error:payoutError}=await admin.from("phone_host_payout_accounts").upsert({host_phone:phone,account_holder_name:holder,payout_method:method,account_number:method==="bank"?account:null,ifsc_code:method==="bank"?ifsc:null,upi_id:method==="upi"?upi:null,status:payoutVerified?"verified":"pending_verification",verification_note:null,verified_at:payoutVerified?now:null,updated_at:now},{onConflict:"host_phone"}); if(payoutError) throw payoutError;
      await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:"host_assisted_onboarding",entity_type:"host_application",entity_id:phone,after_state:{approved:approve,payout_method:method,payout_verified:payoutVerified,pan_last4:pan.slice(-4),aadhaar_last4:aadhaar.slice(-4)}}); return reply({ok:true});
    }
    if (action === "review_host") {
      requireRole(role, ["super_admin", "moderator"]); const id = typeof body.id === "string" ? body.id : ""; const status = typeof body.status === "string" ? body.status : "";
      requirePage(pages, "Hosts");
      if (!id || !["approved", "rejected", "inactive", "archived"].includes(status)) throw new Error("Choose a valid Host status.");
      const { error } = await admin.from("host_applications").update({ status, reviewed_at: new Date().toISOString(), review_note: typeof body.note === "string" ? body.note : null, archived_at: status === "archived" ? new Date().toISOString() : null }).eq("id", id); if (error) throw error;
      await admin.from("admin_audit_logs").insert({ admin_user_id:user.id, action:"host_reviewed", entity_type:"host_application", entity_id:id, after_state:{status} }); return reply({ ok:true });
    }
    if (action === "review_bank_account") {
      requireSuperAdmin(role); requirePage(pages, "Hosts");
      const phone = typeof body.phone === "string" ? body.phone : "";
      const status = typeof body.status === "string" ? body.status : "";
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (!phone || !["verified", "rejected"].includes(status)) throw new Error("Choose Verify or Reject for this payout destination.");
      if (status === "rejected" && !note) throw new Error("Enter a reason before rejecting a payout destination.");
      const { data: before, error: beforeError } = await admin.from("phone_host_payout_accounts").select("status,verification_note").eq("host_phone", phone).maybeSingle();
      if (beforeError || !before) throw beforeError || new Error("Host payout destination was not found.");
      const { error } = await admin.from("phone_host_payout_accounts").update({ status, verification_note: note || null, verified_at: status === "verified" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("host_phone", phone);
      if (error) throw error;
      await admin.from("admin_audit_logs").insert({ admin_user_id:user.id, action:"payout_destination_reviewed", entity_type:"host_payout_destination", entity_id:phone, before_state:before, after_state:{status,note:note||null} });
      return reply({ ok:true });
    }
    if (action === "list_payouts") {
      requireRole(role, ["super_admin", "finance_admin"]); const { data: withdrawals, error } = await admin.from("phone_host_withdrawals").select("id,host_phone,amount_paise,status,payout_reference,review_note,account_snapshot,created_at,updated_at,review_started_at,review_due_at").order("created_at", { ascending:false }).limit(250); if (error) throw error;
      requirePage(pages, "Payouts");
      const phones = [...new Set((withdrawals || []).map((item) => item.host_phone))];
      if (!phones.length) return reply({ items: [] });
      const [{ data: profiles, error: profileError }, { data: accounts, error: accountError }, { data: earnings, error: earningsError }, { data: allWithdrawals, error: allWithdrawalsError }] = await Promise.all([
        admin.from("phone_profiles").select("phone,display_name,username,gender,date_of_birth,city,bio,languages,interests,avatar_url,created_at,updated_at").in("phone", phones),
        admin.from("phone_host_payout_accounts").select("host_phone,account_holder_name,payout_method,account_number,ifsc_code,upi_id,status,verification_note,verified_at,updated_at").in("host_phone", phones),
        admin.from("phone_host_earnings_ledger").select("host_phone,earnings_paise").in("host_phone", phones),
        admin.from("phone_host_withdrawals").select("host_phone,amount_paise,status").in("host_phone", phones).limit(1000),
      ]); if (profileError || accountError || earningsError || allWithdrawalsError) throw profileError || accountError || earningsError || allWithdrawalsError;
      const profilesByPhone = new Map((profiles || []).map((profile) => [profile.phone, profile])); const accountsByPhone = new Map((accounts || []).map((account) => [account.host_phone, account])); const totalsByPhone = new Map<string,{earned:number;withdrawn:number;reserved:number}>();
      for (const phone of phones) totalsByPhone.set(phone,{earned:0,withdrawn:0,reserved:0});
      for (const earning of earnings || []) { const total=totalsByPhone.get(earning.host_phone); if(total) total.earned+=Number(earning.earnings_paise||0); }
      for (const payout of allWithdrawals || []) { const total=totalsByPhone.get(payout.host_phone); if(!total) continue; const amount=Number(payout.amount_paise||0); if(payout.status==="completed") total.withdrawn+=amount; if(["pending","in_review","processing","completed"].includes(String(payout.status))) total.reserved+=amount; }
      return reply({ items:(withdrawals || []).map((withdrawal) => { const total=totalsByPhone.get(withdrawal.host_phone)||{earned:0,withdrawn:0,reserved:0}; return { ...withdrawal, profile: profilesByPhone.get(withdrawal.host_phone), bank_account: accountsByPhone.get(withdrawal.host_phone) || null, total_earnings_paise:total.earned, total_withdrawn_paise:total.withdrawn, available_earnings_paise:Math.max(0,total.earned-total.reserved) }; }) });
    }
    if (action === "list_support_tickets") {
      requireRole(role, ["super_admin", "moderator", "support"]); requirePage(pages, "Support");
      const { data: tickets, error } = await admin.from("phone_support_tickets").select("id,phone,subject,category,status,created_at,updated_at,resolved_at").order("updated_at", { ascending: false }).limit(250); if (error) throw error;
      const ids=(tickets||[]).map((ticket)=>ticket.id), phones=(tickets||[]).map((ticket)=>ticket.phone);
      const [{data:messages,error:messageError},{data:profiles,error:profileError}]=await Promise.all([
        ids.length?admin.from("phone_support_ticket_messages").select("id,ticket_id,sender_type,message,created_at").in("ticket_id",ids).order("created_at",{ascending:true}):Promise.resolve({data:[],error:null}),
        phones.length?admin.from("phone_profiles").select("phone,display_name,username,gender,created_at").in("phone",phones):Promise.resolve({data:[],error:null}),
      ]); if(messageError||profileError) throw messageError||profileError;
      const messagesByTicket=new Map<string,unknown[]>(); for(const item of messages||[]){const list=messagesByTicket.get(item.ticket_id)||[];list.push(item);messagesByTicket.set(item.ticket_id,list);} const profilesByPhone=new Map((profiles||[]).map((profile)=>[profile.phone,profile]));
      return reply({items:(tickets||[]).map((ticket)=>({...ticket,profile:profilesByPhone.get(ticket.phone),messages:messagesByTicket.get(ticket.id)||[]}))});
    }
    if (action === "reply_support_ticket") {
      requireRole(role, ["super_admin", "moderator", "support"]); requirePage(pages, "Support");
      const id=typeof body.id === "string"?body.id:"", text=typeof body.message === "string"?body.message.trim():"", resolve=body.resolve === true;
      if(!id||text.length<1||text.length>2000) throw new Error("Enter a reply of up to 2,000 characters.");
      const {data:before,error:beforeError}=await admin.from("phone_support_tickets").select("status,subject").eq("id",id).maybeSingle(); if(beforeError||!before) throw beforeError||new Error("Support request not found."); if(before.status === "resolved") throw new Error("This support request is already resolved.");
      const now=new Date().toISOString(), status=resolve?"resolved":"waiting_for_member";
      const {error:messageError}=await admin.from("phone_support_ticket_messages").insert({ticket_id:id,sender_type:"admin",admin_user_id:user.id,message:text}); if(messageError) throw messageError;
      const {error:updateError}=await admin.from("phone_support_tickets").update({status,updated_at:now,resolved_at:resolve?now:null}).eq("id",id); if(updateError) throw updateError;
      await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:resolve?"support_ticket_resolved":"support_ticket_replied",entity_type:"support_ticket",entity_id:id,before_state:before,after_state:{status}}); return reply({ok:true});
    }
    if (action === "review_support_ticket") {
      requireRole(role, ["super_admin", "moderator", "support"]); requirePage(pages, "Support"); const id=typeof body.id === "string"?body.id:""; if(!id) throw new Error("Choose a support request.");
      const {data:before,error:beforeError}=await admin.from("phone_support_tickets").select("status").eq("id",id).maybeSingle(); if(beforeError||!before) throw beforeError||new Error("Support request not found."); if(before.status === "resolved") throw new Error("This support request is already resolved.");
      const {error}=await admin.from("phone_support_tickets").update({status:"in_review",updated_at:new Date().toISOString()}).eq("id",id); if(error) throw error; await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:"support_ticket_review_started",entity_type:"support_ticket",entity_id:id,before_state:before,after_state:{status:"in_review"}}); return reply({ok:true});
    }
    if (action === "review_payout") {
      requireRole(role, ["super_admin", "finance_admin"]); const id=typeof body.id === "string"?body.id:""; const status=typeof body.status === "string"?body.status:""; if(!id || !["in_review","completed","rejected","failed"].includes(status)) throw new Error("Choose a valid payout status.");
      requirePage(pages, "Payouts");
      const reference = typeof body.reference === "string" ? body.reference.trim() : ""; const note = typeof body.note === "string" ? body.note.trim() : "";
      if (status === "completed" && (!reference || !note)) throw new Error("A payout reference/UTR and reviewer note are required before completion.");
      const { error } = await admin.rpc("review_phone_host_withdrawal", { input_withdrawal_id:id, input_status:status, input_payout_reference:reference||null, input_review_note:note||null }); if(error) throw error; await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:"payout_reviewed",entity_type:"withdrawal",entity_id:id,after_state:{status,reference:reference||null,note:note||null}}); return reply({ok:true});
    }
    if (action === "list_payments") { requireRole(role,["super_admin","finance_admin"]); requirePage(pages,"Payments"); const {data,error}=await admin.from("phone_payment_orders").select("id,phone,coins,amount_paise,currency,provider_order_id,provider_payment_id,status,created_at,captured_at,credited_at").order("created_at",{ascending:false}).limit(150); if(error)throw error; const phones=(data||[]).map((item)=>item.phone); const {data:profiles,error:profileError}=phones.length?await admin.from("phone_profiles").select("phone,display_name,username,gender,date_of_birth,city,bio,languages,interests,avatar_url,created_at,updated_at").in("phone",phones):{data:[],error:null}; if(profileError)throw profileError; const byPhone=new Map((profiles||[]).map((profile)=>[profile.phone,profile])); return reply({items:(data||[]).map((item)=>({...item,profile:byPhone.get(item.phone)}))}); }
    if (action === "reconcile_payment") { requireRole(role,["super_admin","finance_admin"]); requirePage(pages,"Payments"); const id=typeof body.id==="string"?body.id:""; if(!id)throw new Error("Choose a payment order."); const {data:before,error:beforeError}=await admin.from("phone_payment_orders").select("status,credited_at,provider_payment_id").eq("id",id).maybeSingle(); if(beforeError||!before)throw beforeError||new Error("Payment order not found."); if(before.status!=="captured")throw new Error("Only a captured payment can be reconciled."); const {data,error}=await admin.rpc("credit_phone_wallet_payment",{input_payment_order_id:id}); if(error)throw error; await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:"payment_reconciled",entity_type:"payment_order",entity_id:id,before_state:before,after_state:data}); return reply({ok:true,result:data}); }
    if (action === "list_users") { requireRole(role,["super_admin","moderator","support"]); requirePage(pages,"Users"); const { data,error }=await admin.from("phone_profiles").select("phone,display_name,username,gender,date_of_birth,city,bio,languages,interests,avatar_url,created_at,updated_at").order("created_at",{ascending:false}).limit(150); if(error)throw error; const phones=(data||[]).map((profile)=>profile.phone); const [{data:statuses,error:statusError},{data:applications,error:applicationError},{data:presence,error:presenceError}]=await Promise.all([phones.length?admin.from("phone_user_admin_status").select("phone,status,updated_at,archived_at").in("phone",phones):Promise.resolve({data:[],error:null}),phones.length?admin.from("host_applications").select("phone,status").in("phone",phones):Promise.resolve({data:[],error:null}),phones.length?admin.from("phone_user_presence").select("phone,last_seen_at").in("phone",phones):Promise.resolve({data:[],error:null})]);if(statusError||applicationError||presenceError)throw statusError||applicationError||presenceError;const statusesByPhone=new Map((statuses||[]).map((status)=>[status.phone,status]));const approvedHosts=new Set((applications||[]).filter((application)=>application.status==="approved").map((application)=>application.phone));const presenceByPhone=new Map((presence||[]).map((record)=>[record.phone,record.last_seen_at]));const onlineThreshold=Date.now()-60000;return reply({items:(data||[]).map((profile)=>{const lastSeenAt=presenceByPhone.get(profile.phone)||null;return {...profile,account_status:statusesByPhone.get(profile.phone)?.status||"active",account_status_updated_at:statusesByPhone.get(profile.phone)?.updated_at||null,is_host:approvedHosts.has(profile.phone),last_seen_at:lastSeenAt,is_online:!!lastSeenAt&&Date.parse(lastSeenAt)>=onlineThreshold&&(!statusesByPhone.get(profile.phone)||statusesByPhone.get(profile.phone)?.status==="active")};})}); }
    if (action === "set_user_status") { requireRole(role,["super_admin","moderator"]); requirePage(pages,"Users"); const phone=typeof body.phone === "string"?body.phone:""; const status=typeof body.status === "string"?body.status:""; if(!phone||!["active","suspended","inactive","archived"].includes(status))throw new Error("Invalid user status."); const {error}=await admin.from("phone_user_admin_status").upsert({phone,status,reason:typeof body.reason === "string"?body.reason:null,updated_by:user.id,updated_at:new Date().toISOString(),archived_at:status==="archived"?new Date().toISOString():null},{onConflict:"phone"});if(error)throw error;await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:"user_status_changed",entity_type:"phone_user",entity_id:phone,after_state:{status}});return reply({ok:true}); }
    if (action === "list_safety") { requireRole(role,["super_admin","moderator"]); requirePage(pages,"Reports"); const {data,error}=await admin.from("safety_reports").select("id,reporter_name,reported_user_id,reported_user_name,reason,details,status,resolution_note,created_at").order("created_at",{ascending:false}).limit(100);if(error)throw error; const ids=(data||[]).map((item)=>item.id); const {data:notes,error:noteError}=ids.length?await admin.from("admin_moderation_notes").select("id,entity_id,note,created_by,created_at").eq("entity_type","safety_report").in("entity_id",ids).order("created_at",{ascending:false}):{data:[],error:null};if(noteError)throw noteError; const notesById=new Map<string,unknown[]>();for(const note of notes||[]){const values=notesById.get(note.entity_id)||[];values.push(note);notesById.set(note.entity_id,values);}return reply({items:(data||[]).map((item)=>({...item,moderation_notes:notesById.get(item.id)||[]}))}); }
    if (action === "list_audit_logs") { requireSuperAdmin(role); requirePage(pages,"Audit log"); const {data,error}=await admin.from("admin_audit_logs").select("id,admin_user_id,action,entity_type,entity_id,before_state,after_state,created_at").order("created_at",{ascending:false}).limit(150);if(error)throw error;return reply({items:data||[]}); }
    if (action === "host_document_url") { requireRole(role,["super_admin","moderator"]); requirePage(pages,"Hosts"); const id=typeof body.id === "string"?body.id:""; const kind=body.kind === "aadhaar" || body.kind === "pan" ? body.kind : ""; if(!id || !kind) throw new Error("Choose a Host document."); const {data:application,error}=await admin.from("host_applications").select("phone,application_profile,aadhaar_path,pan_path").eq("id",id).maybeSingle(); if(error||!application) throw error||new Error("Host application not found."); const profile=application.application_profile && typeof application.application_profile === "object" ? application.application_profile as Record<string,unknown> : {}; const path=typeof profile[`${kind}Path`] === "string" ? profile[`${kind}Path`] : kind === "aadhaar" ? application.aadhaar_path : application.pan_path; if(typeof path !== "string" || !path) throw new Error("This legacy application has a document name only; no secure file was uploaded."); const {data:signed,error:signedError}=await admin.storage.from("host-verification").createSignedUrl(path,60); if(signedError||!signed?.signedUrl) throw signedError||new Error("Unable to prepare the document."); await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:"host_verification_document_viewed",entity_type:"host_application",entity_id:id,after_state:{kind}}); return reply({url:signed.signedUrl}); }
    if (action === "list_coin_packs") { requireRole(role,["super_admin","finance_admin"]); requirePage(pages,"Coin packs"); const {data,error}=await admin.from("coin_packs").select("*").order("sort_order",{ascending:true}).limit(100);if(error)throw error;return reply({items:data||[]}); }
    if (action === "set_coin_pack_active") { requireRole(role,["super_admin","finance_admin"]); requirePage(pages,"Coin packs"); const id=typeof body.id === "string"?body.id:""; const active=typeof body.active === "boolean"?body.active:null; if(!id || active === null) throw new Error("Choose a coin pack and activation state."); const {error}=await admin.from("coin_packs").update({active}).eq("id",id); if(error)throw error; await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:"coin_pack_activation_changed",entity_type:"coin_pack",entity_id:id,after_state:{active}}); return reply({ok:true}); }
    if (action === "save_special_offer") {
      requireRole(role,["super_admin","finance_admin"]); requirePage(pages,"Coin packs");
      const id=typeof body.id === "string" ? body.id : ""; const coins=Number(body.coins); const bonus=Number(body.bonus_coins||0); const price=Number(body.price_paise); const label=typeof body.special_label === "string" ? body.special_label.trim().slice(0,80) : "Special offer";
      const parseDate=(value:unknown)=>typeof value === "string" && value ? new Date(value) : null; const from=parseDate(body.available_from); const until=parseDate(body.available_until);
      if(!Number.isInteger(coins)||coins<1||!Number.isInteger(bonus)||bonus<0||!Number.isInteger(price)||price<1) throw new Error("Enter valid coins, bonus coins, and price.");
      if((from&&Number.isNaN(from.getTime()))||(until&&Number.isNaN(until.getTime()))||(from&&until&&until<=from)) throw new Error("Choose a valid offer schedule.");
      const values={coins,bonus_coins:bonus,price_paise:price,is_special:true,special_label:label||"Special offer",available_from:from?.toISOString()||null,available_until:until?.toISOString()||null,active:body.active!==false};
      if(id){const {error}=await admin.from("coin_packs").update(values).eq("id",id);if(error)throw error;await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:"special_offer_updated",entity_type:"coin_pack",entity_id:id,after_state:values});return reply({ok:true});}
      const {data:latest,error:sortError}=await admin.from("coin_packs").select("sort_order").order("sort_order",{ascending:false}).limit(1).maybeSingle();if(sortError)throw sortError;
      const {data:created,error}=await admin.from("coin_packs").insert({...values,sort_order:Math.min(2147483640,Number(latest?.sort_order||0)+10)}).select("id").single();if(error)throw error;await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:"special_offer_created",entity_type:"coin_pack",entity_id:created.id,after_state:values});return reply({ok:true,id:created.id});
    }
    if (action === "review_safety") { requireRole(role,["super_admin","moderator"]); requirePage(pages,"Reports");const id=typeof body.id === "string"?body.id:"";const status=typeof body.status === "string"?body.status:"";const note=typeof body.note === "string"?body.note.trim():"";if(!id||!["Under review","Resolved","Rejected"].includes(status))throw new Error("Invalid report status.");const {data:before,error:beforeError}=await admin.from("safety_reports").select("status,resolution_note").eq("id",id).maybeSingle();if(beforeError||!before)throw beforeError||new Error("Safety report was not found.");if(["Resolved","Rejected"].includes(before.status))throw new Error("This report is already closed. Add a note if more information is needed.");if(["Resolved","Rejected"].includes(status)&&!note)throw new Error("Add a decision note before closing a report.");const {error}=await admin.from("safety_reports").update({status,resolution_note:note||before.resolution_note||null}).eq("id",id);if(error)throw error;await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:"safety_report_reviewed",entity_type:"safety_report",entity_id:id,before_state:before,after_state:{status,note:note||null}});return reply({ok:true}); }
    if (action === "add_moderation_note") { requireRole(role,["super_admin","moderator"]); const entityType=typeof body.entity_type==="string"?body.entity_type:""; const entityId=typeof body.entity_id==="string"?body.entity_id:""; const note=typeof body.note==="string"?body.note.trim():""; const page=entityType==="safety_report"?"Reports":entityType==="host_application"?"Hosts":"Users"; requirePage(pages,page); if(!["phone_user","host_application","safety_report"].includes(entityType)||!entityId||!note)throw new Error("Enter a note for this record."); const {error}=await admin.from("admin_moderation_notes").insert({entity_type:entityType,entity_id:entityId,note,created_by:user.id});if(error)throw error;await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:"moderation_note_added",entity_type:entityType,entity_id:entityId,after_state:{note}});return reply({ok:true}); }
    if (action === "change_own_password") {
      requireSuperAdmin(role);
      requirePage(pages, "Admin access");
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password });
      if (updateError) throw updateError;
      const { error: auditError } = await admin.from("admin_audit_logs").insert({ admin_user_id: user.id, action: "super_admin_password_changed", entity_type: "admin_account", entity_id: user.id });
      if (auditError) throw auditError;
      return reply({ ok: true });
    }
    if (action === "reset_staff_password") {
      requireSuperAdmin(role);
      requirePage(pages, "Admin access");
      const targetUserId = typeof body.user_id === "string" ? body.user_id : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!targetUserId || targetUserId === user.id) throw new Error("Use Super Admin security settings to change your own password.");
      if (password.length < 8) throw new Error("Use a temporary password of at least 8 characters.");
      const { data: targetRole, error: targetError } = await admin.from("admin_roles").select("role").eq("user_id", targetUserId).maybeSingle();
      if (targetError || !targetRole || targetRole.role === "super_admin") throw new Error("Only staff account passwords can be reset here.");
      const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, { password });
      if (updateError) throw updateError;
      const { error: auditError } = await admin.from("admin_audit_logs").insert({ admin_user_id: user.id, action: "staff_password_reset", entity_type: "admin_account", entity_id: targetUserId });
      if (auditError) throw auditError;
      return reply({ ok: true });
    }
    if (action === "dashboard") {
      requirePage(pages, "Overview");
      const requestedStart = typeof body.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date) ? `${body.start_date}T00:00:00.000Z` : "";
      const requestedEnd = typeof body.end_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.end_date) ? `${body.end_date}T23:59:59.999Z` : "";
      if ((requestedStart && !requestedEnd) || (!requestedStart && requestedEnd) || (requestedStart && requestedEnd && requestedStart > requestedEnd)) throw new Error("Choose a valid start and end date.");
      const days = [7, 30, 90].includes(Number(body.days)) ? Number(body.days) : 30;
      const since = body.all_time === true ? "" : requestedStart || new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const until = requestedEnd;
      const applyRange = <T>(query: T & { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }, column: string) => { let scoped = query; if (since) scoped = scoped.gte(column, since); if (until) scoped = scoped.lte(column, until); return scoped; };
      const [hostsPending, activeHosts, payoutsPending, safetyPending, usersTotal, paymentsPending] = await Promise.all([
        admin.from("host_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
        admin.from("host_applications").select("id", { count: "exact", head: true }).eq("status", "approved"),
        admin.from("phone_host_withdrawals").select("id", { count: "exact", head: true }).in("status", ["pending", "in_review", "processing"]),
        admin.from("safety_reports").select("id", { count: "exact", head: true }).in("status", ["Open", "Under review"]),
        admin.from("phone_profiles").select("phone", { count: "exact", head: true }),
        admin.from("phone_payment_orders").select("id", { count: "exact", head: true }).in("status", ["created", "authorized", "failed"]),
      ]);
      const failed = [hostsPending, activeHosts, payoutsPending, safetyPending, usersTotal, paymentsPending].find((result) => result.error);
      if (failed?.error) throw failed.error;
      const [{ data: payments, error: paymentError }, { data: calls, error: callsError }, { data: earnings, error: earningsError }, { data: withdrawals, error: withdrawalsError }, { count: newUsers, error: newUsersError }] = await Promise.all([
        applyRange(admin.from("phone_payment_orders").select("amount_paise,coins").eq("status", "captured"), "captured_at"),
        applyRange(admin.from("call_sessions").select("duration_seconds"), "created_at"),
        applyRange(admin.from("phone_host_earnings_ledger").select("earnings_paise"), "created_at"),
        applyRange(admin.from("phone_host_withdrawals").select("amount_paise,status"), "created_at"),
        applyRange(admin.from("phone_profiles").select("phone", { count: "exact", head: true }), "created_at"),
      ]);
      if (paymentError || callsError || earningsError || withdrawalsError || newUsersError) throw paymentError || callsError || earningsError || withdrawalsError || newUsersError;
      const revenue_paise = (payments || []).reduce((total, payment) => total + Number(payment.amount_paise || 0), 0);
      const coins_sold = (payments || []).reduce((total, payment) => total + Number(payment.coins || 0), 0);
      const host_earnings_paise = (earnings || []).reduce((total, row) => total + Number(row.earnings_paise || 0), 0);
      const withdrawals_completed_paise = (withdrawals || []).filter((withdrawal) => withdrawal.status === "completed").reduce((total, withdrawal) => total + Number(withdrawal.amount_paise || 0), 0);
      const withdrawals_completed = (withdrawals || []).filter((withdrawal) => withdrawal.status === "completed").length;
      const call_seconds = (calls || []).reduce((total, call) => total + Math.max(0, Number(call.duration_seconds || 0)), 0);
      return reply({ metrics: { hosts_pending: hostsPending.count || 0, active_hosts: activeHosts.count || 0, payouts_pending: payoutsPending.count || 0, safety_pending: safetyPending.count || 0, users_total: usersTotal.count || 0, payments_pending: paymentsPending.count || 0, revenue_paise, coins_sold, call_seconds, host_earnings_paise, withdrawals_completed_paise, withdrawals_completed, new_users: newUsers || 0, range_days: body.all_time === true ? 0 : days, range_start: requestedStart || null, range_end: requestedEnd || null } });
    }
    if (action === "live_presence") {
      requirePage(pages, "Overview");
      const { data: members, error } = await admin.rpc("get_admin_online_presence");
      if (error) throw error;
      const rows = members || [];
      const hosts = rows.filter((member) => member.member_type === "host");
      const users = rows.filter((member) => member.member_type === "male_user");
      return reply({
        counts: { hosts: hosts.length, male_users: users.length },
        hosts: pages.includes("Hosts") ? hosts : [],
        male_users: pages.includes("Users") ? users : [],
        checked_at: new Date().toISOString(),
      });
    }
    return reply({ admin: { id: user.id, email: user.email, role, pages } });
  } catch (error) {
    return reply({ error: errorMessage(error) }, 403);
  }
});
