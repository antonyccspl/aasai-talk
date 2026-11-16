import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fileSuffix, fileTypeFromSuffix, hasValidFileSignature } from "../_shared/file-validation.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const defaultPages: Record<string, string[]> = {
  super_admin: ["Overview", "Performance", "Hosts", "Payouts", "Payments", "Users", "Account deletions", "Reports", "Support", "Coin packs", "Admin access", "Audit log"],
  finance_admin: ["Overview", "Payouts", "Payments", "Coin packs"],
  moderator: ["Overview", "Hosts", "Users", "Reports", "Support"],
  support: ["Overview", "Users", "Account deletions", "Support"],
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
      const requiredBooleanFields = [
        "audio",
        "video",
        "accepting_audio_calls",
        "accepting_video_calls",
        "admin_photo_safety_attested",
        "admin_identity_review_attested",
        "admin_payout_review_attested",
        "pan_verified",
        "aadhaar_verified",
        "payout_verified",
      ];
      if (requiredBooleanFields.some((field) => typeof body[field] !== "boolean"))
        throw new Error("Invalid Host call settings or verification attestations.");
      if (body.new_phone !== undefined && typeof body.new_phone !== "string")
        throw new Error("Enter a valid new Host phone number.");
      if (
        (body.pan_number !== undefined && typeof body.pan_number !== "string") ||
        (body.aadhaar_number !== undefined && typeof body.aadhaar_number !== "string")
      )
        throw new Error("Invalid Host identity details.");
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
      if (method === "upi" && !/^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9._-]{1,64}$/.test(upi))
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
      let photoWasApproved = false;
      try {
        const photoBytes = new Uint8Array(await photo.arrayBuffer());
        if (!hasValidFileSignature(photoBytes, photo.type))
          throw new Error("The Host photo file does not match its selected image type.");
        const contentSha256 = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", photoBytes)),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
        moderationMediaPath = `${phone.replace(/\D/g, "")}/${crypto.randomUUID()}.${fileSuffix(photo.type)}`;
        const moderationUpload = await admin.storage.from("moderation-media").upload(moderationMediaPath, photoBytes, {
          contentType: photo.type,
          upsert: false,
        });
        if (moderationUpload.error) throw moderationUpload.error;
        const { error: identityError } = await admin.rpc("open_phone_identity", {
          input_phone: phone,
        });
        if (identityError) throw identityError;
        const { data: moderationItem, error: moderationInsertError } = await admin.from("phone_content_moderation_items").insert({
          owner_phone: phone,
          content_type: "profile_photo",
          storage_bucket: "moderation-media",
          storage_path: moderationMediaPath,
          media_type: photo.type,
          scan_provider: "admin_manual",
          adult_likelihood: "UNKNOWN",
          racy_likelihood: "UNKNOWN",
          provider_result: { review_method: "super_admin_attestation", content_sha256: contentSha256 },
          content_sha256: contentSha256,
          status: "approved",
          decision_note: "Manually approved by a Super Admin during Instagram Host onboarding.",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).select("id").single();
        if (moderationInsertError) throw moderationInsertError;
        moderationItemId = moderationItem.id;

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
        photoWasApproved = true;

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
        return reply({ ok: true, application_id: applicationId, photo_review_mode: "admin_manual" });
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
        } else if (moderationMediaPath && moderationItemId && photoWasApproved && publicPhotoPath) {
          const { error: itemError } = await admin.from("phone_content_moderation_items")
            .update({ public_url: null, decision_note: "Manual photo-safety review passed; Host setup did not complete.", updated_at: new Date().toISOString() })
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
      const [{ data: profiles, error: profileError }, { data: applications, error: applicationError }, { data: phoneChanges, error: phoneChangesError }] = await Promise.all([
        admin.from("phone_profiles").select("phone,display_name,username,gender,date_of_birth,city,bio,languages,interests,avatar_url,created_at,updated_at").eq("gender", "Female").order("created_at", { ascending: false }).limit(250),
        admin.from("host_applications").select("id,phone,status,application_profile,aadhaar_path,pan_path,submitted_at,reviewed_at,review_note").limit(250),
        role === "super_admin"
          ? admin.from("admin_host_phone_change_requests").select("host_phone,new_phone,expires_at,status").eq("status", "pending").gt("expires_at", new Date().toISOString())
          : Promise.resolve({ data: [], error: null }),
      ]); if (profileError || applicationError) throw profileError || applicationError;
      if (phoneChangesError) throw phoneChangesError;
      const applicationProfile = (value: unknown) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? value as Record<string, unknown>
          : {};
      const photoReviewPhones = new Map<string, string>();
      for (const application of applications || []) {
        const photoReviewId = applicationProfile(application.application_profile).photo_review_id;
        if (typeof photoReviewId === "string" && application.phone)
          photoReviewPhones.set(photoReviewId, application.phone);
      }
      const photoReviewIds = [...photoReviewPhones.keys()];
      const { data: photoItems, error: photoError } = photoReviewIds.length
        ? await admin.from("phone_content_moderation_items")
          .select("id,owner_phone,storage_bucket,storage_path,status")
          .in("id", photoReviewIds)
        : { data: [], error: null };
      if (photoError) throw photoError;
      const photoPreviews = new Map<string, string>();
      for (const item of photoItems || []) {
        if (
          photoReviewPhones.get(item.id) !== item.owner_phone
          || item.storage_bucket !== "moderation-media"
          || typeof item.storage_path !== "string"
          || !item.storage_path
          || !["needs_review", "approved"].includes(item.status)
        ) throw new Error("A pending Host photo has invalid private storage metadata.");
        const { data: signed, error: signedError } = await admin.storage
          .from("moderation-media").createSignedUrl(item.storage_path, 300);
        if (signedError || !signed?.signedUrl)
          throw signedError || new Error("Could not prepare a private Host photo preview.");
        photoPreviews.set(item.id, signed.signedUrl);
      }

      const phones=(profiles||[]).map((profile)=>profile.phone); const [{data:accounts,error:accountError},{data:compliance,error:complianceError}]=await Promise.all([
        phones.length?admin.from("phone_host_payout_accounts").select("host_phone,account_holder_name,payout_method,account_number,ifsc_code,upi_id,status,verification_note,verified_at,updated_at").in("host_phone",phones):Promise.resolve({data:[],error:null}),
        phones.length?admin.from("phone_host_compliance").select("host_phone,pan_last4,aadhaar_last4,pan_verified,aadhaar_verified,verified_at,updated_at").in("host_phone",phones):Promise.resolve({data:[],error:null}),
      ]); if(accountError||complianceError) throw accountError||complianceError;
      const { data: presence, error: presenceError } = await (
        phones.length
          ? admin
            .from("phone_host_presence")
            .select("host_phone,last_seen_at,accepting_calls,accepting_audio_calls,accepting_video_calls")
            .in("host_phone", phones)
          : Promise.resolve({ data: [], error: null })
      );
      if (presenceError) throw presenceError;

      const applicationsByPhone = new Map(
        (applications || []).map((application) => [application.phone, application]),
      );
      const accountsByPhone = new Map(
        (accounts || []).map((account) => [account.host_phone, account]),
      );
      const complianceByPhone = new Map(
        (compliance || []).map((record) => [record.host_phone, record]),
      );
      const phoneChangesByPhone = new Map(
        (phoneChanges || []).map((record) => [record.host_phone, record]),
      );
      const presenceByPhone = new Map(
        (presence || []).map((record) => [record.host_phone, record]),
      );
      const today = Date.now() - 86400000;
      return reply({
        items: (profiles || []).map((profile) => {
          const application = applicationsByPhone.get(profile.phone);
          const hostPresence = presenceByPhone.get(profile.phone);
          const lastSeenAt = hostPresence?.last_seen_at || null;
          const profileData = applicationProfile(application?.application_profile);
          const photoReviewId = profileData.photo_review_id;
          const photoPreviewUrl =
            typeof photoReviewId === "string"
              ? photoPreviews.get(photoReviewId)
              : null;
          return {
            ...(application || {
              id: `lead:${profile.phone}`,
              phone: profile.phone,
              status: "new",
              submitted_at: profile.created_at,
              application_profile: {},
            }),
            application_profile: photoPreviewUrl
              ? { ...profileData, photo_preview_url: photoPreviewUrl }
              : profileData,
            profile,
            bank_account: accountsByPhone.get(profile.phone) || null,
            compliance: complianceByPhone.get(profile.phone) || null,
            pending_phone_change: phoneChangesByPhone.get(profile.phone) || null,
            is_new: Date.parse(profile.created_at) >= today,
            last_seen_at: lastSeenAt,
            accepting_calls: hostPresence?.accepting_calls === true,
            accepting_audio_calls: hostPresence?.accepting_audio_calls ?? true,
            accepting_video_calls: hostPresence?.accepting_video_calls ?? true,
            is_online:
              application?.status === "approved" &&
              hostPresence?.accepting_calls === true,
          };
        }),
      });
    }
    if (action === "update_host_details") {
      requireSuperAdmin(role);
      requirePage(pages, "Hosts");
      if (!uploadForm) throw new Error("Host edit data must be submitted as a multipart request.");

      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const displayName = typeof body.display_name === "string" ? body.display_name.trim().replace(/\s+/g, " ") : "";
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const dateOfBirth = typeof body.date_of_birth === "string" ? body.date_of_birth : "";
      const city = typeof body.city === "string" ? body.city.trim().replace(/\s+/g, " ") : "";
      const bio = typeof body.bio === "string" ? body.bio.trim() : "";
      const languages = asStringArray(body.languages, 4, "languages");
      const interests = asStringArray(body.interests, 6, "interests");
      const audio = body.audio === true;
      const video = body.video === true;
      const acceptingAudioCalls = body.accepting_audio_calls === true;
      const acceptingVideoCalls = body.accepting_video_calls === true;
      const phoneInput = typeof body.new_phone === "string" ? body.new_phone.trim() : "";
      const newPhone = phoneInput || null;
      const photoSafetyAttested = body.admin_photo_safety_attested === true;
      const identityReviewAttested = body.admin_identity_review_attested === true;
      const payoutReviewAttested = body.admin_payout_review_attested === true;
      const photoValue = uploadForm.get("photo");
      const aadhaarValue = uploadForm.get("aadhaar_file");
      const panValue = uploadForm.get("pan_file");
      if ((photoValue !== null && !(photoValue instanceof File)) ||
          (aadhaarValue !== null && !(aadhaarValue instanceof File)) ||
          (panValue !== null && !(panValue instanceof File)))
        throw new Error("Invalid Host photo or verification document upload.");
      const photo = photoValue instanceof File ? photoValue : null;
      const aadhaarFile = aadhaarValue instanceof File ? aadhaarValue : null;
      const panFile = panValue instanceof File ? panValue : null;

      if (!/^\+91\d{10}$/.test(phone)) throw new Error("Choose a valid Host phone number.");
      if (displayName.length < 2 || displayName.length > 50) throw new Error("Enter a name between 2 and 50 characters.");
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) throw new Error("Use a username with 3–20 letters, numbers, or underscores.");
      if (!isAdultDateOfBirth(dateOfBirth)) throw new Error("The Host must be at least 18 years old. Check the date of birth.");
      if (city.length < 2 || city.length > 80) throw new Error("Enter a city between 2 and 80 characters.");
      if (bio.length < 12 || bio.length > 500) throw new Error("Enter a Host bio between 12 and 500 characters.");
      if (languages.length < 1 || interests.length < 1) throw new Error("Select at least one language and one interest.");
      if ((!audio && !video) || (acceptingAudioCalls && !audio) || (acceptingVideoCalls && !video))
        throw new Error("Choose valid Host call capabilities and preferences.");
      if (newPhone && (!/^\+91\d{10}$/.test(newPhone) || newPhone === phone))
        throw new Error("Enter a different valid Indian mobile number for the Host.");
      if (photo && (photo.size < 1 || photo.size > 5 * 1024 * 1024 || !hostImageTypes.has(photo.type)))
        throw new Error("Choose a JPG, PNG, or WEBP Host photo smaller than 5 MB.");
      if (photo && !photoSafetyAttested)
        throw new Error("Confirm that you reviewed the new profile photo against the Host photo-safety rules.");
      for (const [file, label] of [[aadhaarFile, "Aadhaar"], [panFile, "PAN"]] as const)
        if (file && (file.size < 1 || file.size > 10 * 1024 * 1024 || !hostDocumentTypes.has(file.type)))
          throw new Error(`Choose a valid ${label} image or PDF smaller than 10 MB.`);

      const pan = typeof body.pan_number === "string" ? body.pan_number.trim().toUpperCase() : "";
      const aadhaar = typeof body.aadhaar_number === "string" ? body.aadhaar_number.replace(/\s/g, "") : "";
      if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) throw new Error("Enter a valid PAN number.");
      if (aadhaar && !/^\d{12}$/.test(aadhaar)) throw new Error("Enter a valid 12-digit Aadhaar number.");
      if ((pan || aadhaar || panFile || aadhaarFile) && !identityReviewAttested)
        throw new Error("Confirm that you personally reviewed the Host identity details and documents.");

      const holder = typeof body.account_holder_name === "string" ? body.account_holder_name.trim().replace(/\s+/g, " ") : "";
      const payoutMethod = body.payout_method === "upi" || body.payout_method === "bank" ? body.payout_method : "";
      const upi = typeof body.upi_id === "string" ? body.upi_id.trim().toLowerCase() : "";
      const accountNumber = typeof body.account_number === "string" ? body.account_number.replace(/\s/g, "") : "";
      const ifsc = typeof body.ifsc_code === "string" ? body.ifsc_code.trim().toUpperCase() : "";
      const payoutVerified = body.payout_verified === true;
      const payoutDataProvided = !!(payoutMethod || holder || upi || accountNumber || ifsc);
      if (payoutDataProvided && (!payoutMethod || holder.length < 2 || holder.length > 120))
        throw new Error("Enter a payout method and the account holder's name.");
      if (payoutDataProvided && payoutMethod === "upi" && !/^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9._-]{1,64}$/.test(upi))
        throw new Error("Enter a valid UPI ID.");
      if (payoutDataProvided && payoutMethod === "bank" && (!/^\d{9,18}$/.test(accountNumber) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)))
        throw new Error("Enter a valid bank account number and IFSC code.");
      if (payoutDataProvided && !["upi", "bank"].includes(payoutMethod))
        throw new Error("Choose a valid payout method.");
      if (!payoutDataProvided && payoutVerified)
        throw new Error("Enter the Host payout destination before marking it verified.");
      if (payoutVerified && !payoutReviewAttested)
        throw new Error("Confirm that you personally verified the Host payout destination.");

      const [{ data: profile, error: profileError }, { data: application, error: applicationError }, { data: payout, error: payoutError }, { data: compliance, error: complianceError }] = await Promise.all([
        admin.from("phone_profiles").select("phone,display_name,username,date_of_birth,city,bio,languages,interests,avatar_url,gender").eq("phone", phone).eq("gender", "Female").maybeSingle(),
        admin.from("host_applications").select("id,phone,status,application_profile,aadhaar_path,pan_path").eq("phone", phone).eq("status", "approved").maybeSingle(),
        admin.from("phone_host_payout_accounts").select("account_holder_name,payout_method,account_number,ifsc_code,upi_id,status").eq("host_phone", phone).maybeSingle(),
        admin.from("phone_host_compliance").select("pan_last4,aadhaar_last4,pan_verified,aadhaar_verified").eq("host_phone", phone).maybeSingle(),
      ]);
      if (profileError || applicationError || payoutError || complianceError)
        throw profileError || applicationError || payoutError || complianceError;
      if (!profile || !application) throw new Error("Only an approved Host can be edited.");
      const desiredPanVerified = body.pan_verified === true;
      const desiredAadhaarVerified = body.aadhaar_verified === true;
      if (
        (desiredPanVerified !== (compliance?.pan_verified === true) ||
          desiredAadhaarVerified !== (compliance?.aadhaar_verified === true)) &&
        !identityReviewAttested
      )
        throw new Error("Confirm that you reviewed the current identity records before changing verification status.");
      const { data: matchingUsername, error: usernameError } = await admin.from("phone_profiles")
        .select("phone").ilike("username", username).neq("phone", phone).limit(1).maybeSingle();
      if (usernameError) throw usernameError;
      if (matchingUsername) throw new Error("That username is already in use.");
      if (newPhone) {
        const { data: activeCall, error: callError } = await admin.from("call_sessions")
          .select("id").eq("host_phone", phone).in("status", ["ringing", "connected"]).limit(1).maybeSingle();
        if (callError) throw callError;
        if (activeCall) throw new Error("The Host cannot change their phone number during a call.");
      }

      if (!!pan !== !!panFile)
        throw new Error("Provide both a PAN number and its updated document.");
      if (!!aadhaar !== !!aadhaarFile)
        throw new Error("Provide both an Aadhaar number and its updated document.");

      const storedApplicationProfile =
        application.application_profile && typeof application.application_profile === "object" && !Array.isArray(application.application_profile)
          ? { ...application.application_profile as Record<string, unknown> }
          : {};
      let avatarUrl = profile.avatar_url;
      let aadhaarPath = application.aadhaar_path || (typeof storedApplicationProfile.aadhaarPath === "string" ? storedApplicationProfile.aadhaarPath : null);
      let panPath = application.pan_path || (typeof storedApplicationProfile.panPath === "string" ? storedApplicationProfile.panPath : null);
      const uploaded: { bucket: string; path: string }[] = [];
      let moderationItemId: string | null = null;
      let rpcStarted = false;
      try {
        if (photo) {
          const bytes = new Uint8Array(await photo.arrayBuffer());
          if (!hasValidFileSignature(bytes, photo.type)) throw new Error("The Host photo does not match its selected image type.");
          const contentSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
          const path = `${phone.replace(/\D/g, "")}/${crypto.randomUUID()}.${fileSuffix(photo.type)}`;
          const { error: moderationUploadError } = await admin.storage.from("moderation-media").upload(path, bytes, { contentType: photo.type, upsert: false });
          if (moderationUploadError) throw moderationUploadError;
          uploaded.push({ bucket: "moderation-media", path });
          const { data: moderationItem, error: moderationInsertError } = await admin.from("phone_content_moderation_items").insert({
            owner_phone: phone, content_type: "profile_photo", storage_bucket: "moderation-media", storage_path: path,
            media_type: photo.type, scan_provider: "admin_manual", adult_likelihood: "UNKNOWN", racy_likelihood: "UNKNOWN",
            provider_result: { review_method: "super_admin_attestation", content_sha256: contentSha256 }, content_sha256: contentSha256,
            status: "approved", decision_note: "Manually approved by a Super Admin during Host profile editing.",
            reviewed_by: user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).select("id").single();
          if (moderationInsertError) throw moderationInsertError;
          moderationItemId = moderationItem.id;

          const publicPath = `${phone.replace(/\D/g, "")}/${crypto.randomUUID()}.${fileSuffix(photo.type)}`;
          const { error: publicUploadError } = await admin.storage.from("host-photos").upload(publicPath, bytes, { contentType: photo.type, upsert: false });
          if (publicUploadError) throw publicUploadError;
          uploaded.push({ bucket: "host-photos", path: publicPath });
          avatarUrl = admin.storage.from("host-photos").getPublicUrl(publicPath).data.publicUrl;
          const { error: moderationUpdateError } = await admin.from("phone_content_moderation_items")
            .update({ public_url: avatarUrl, updated_at: new Date().toISOString() }).eq("id", moderationItemId);
          if (moderationUpdateError) throw moderationUpdateError;
        }
        const uploadDocument = async (file: File, kind: "aadhaar" | "pan") => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!hasValidFileSignature(bytes, file.type))
            throw new Error(`The ${kind.toUpperCase()} document does not match its selected file type.`);
          const path = `${phone.replace(/\D/g, "")}/${kind}-${crypto.randomUUID()}.${fileSuffix(file.type)}`;
          const { error } = await admin.storage.from("host-verification").upload(path, bytes, { contentType: file.type, upsert: false });
          if (error) throw error;
          uploaded.push({ bucket: "host-verification", path });
          return path;
        };
        if (aadhaarFile) aadhaarPath = await uploadDocument(aadhaarFile, "aadhaar");
        if (panFile) panPath = await uploadDocument(panFile, "pan");

        const updatedApplicationProfile: Record<string, unknown> = {
          ...storedApplicationProfile,
          name: displayName,
          bio,
          languages,
          interests,
          photo: avatarUrl,
          audio,
          video,
          aadhaarPath,
          panPath,
          ...(aadhaarFile ? { aadhaarDocument: "Updated by administrator" } : {}),
          ...(panFile ? { panDocument: "Updated by administrator" } : {}),
          photoSafetyAdminChecked: photo ? true : storedApplicationProfile.photoSafetyAdminChecked,
        };
        const currentPanLast4 = compliance?.pan_last4 || null;
        const currentAadhaarLast4 = compliance?.aadhaar_last4 || null;
        const updatedPanLast4 = pan ? pan.slice(-4) : currentPanLast4;
        const updatedAadhaarLast4 = aadhaar ? aadhaar.slice(-4) : currentAadhaarLast4;
        const panVerified = desiredPanVerified;
        const aadhaarVerified = desiredAadhaarVerified;
        rpcStarted = true;
        const { data: result, error: updateError } = await admin.rpc("admin_update_host_details", {
          input_phone: phone,
          input_profile: { display_name: displayName, username, date_of_birth: dateOfBirth, city, bio, languages, interests, avatar_url: avatarUrl },
          input_application_profile: updatedApplicationProfile,
          input_call_preferences: { accepting_audio_calls: acceptingAudioCalls, accepting_video_calls: acceptingVideoCalls },
          input_payout: { account_holder_name: holder, payout_method: payoutMethod, account_number: payoutMethod === "bank" ? accountNumber : null, ifsc_code: payoutMethod === "bank" ? ifsc : null, upi_id: payoutMethod === "upi" ? upi : null, payout_verified: payoutVerified },
          input_compliance: { pan_last4: updatedPanLast4, aadhaar_last4: updatedAadhaarLast4, pan_verified: panVerified, aadhaar_verified: aadhaarVerified },
          input_new_phone: newPhone,
          input_admin_user_id: user.id,
        });
        if (updateError) {
          rpcStarted = false;
          throw updateError;
        }
        if (!result || typeof result !== "object" || result.ok !== true)
          throw new Error("The Host update result could not be confirmed.");
        rpcStarted = false;
        return reply({ ok: true, phone_change_requested: result?.phone_change_requested === true });
      } catch (error) {
        if (rpcStarted) {
          console.error("Host edit result is uncertain; preserving uploaded media:", errorMessage(error));
          throw new Error(`${errorMessage(error)} The save result is uncertain; refresh the Host record before retrying.`);
        }
        const cleanupErrors: string[] = [];
        if (moderationItemId) {
          const { error: itemError } = await admin.from("phone_content_moderation_items").delete().eq("id", moderationItemId);
          if (itemError) cleanupErrors.push(itemError.message);
        }
        for (const { bucket, path } of uploaded) {
          const { error: cleanupError } = await admin.storage.from(bucket).remove([path]);
          if (cleanupError) cleanupErrors.push(cleanupError.message);
        }
        if (cleanupErrors.length) {
          console.error("Host edit upload cleanup failed:", cleanupErrors);
          throw new Error(`${errorMessage(error)} An uploaded file could not be removed; contact support.`);
        }
        throw error;
      }
    }
    if (action === "set_host_availability") {
      requireRole(role, ["super_admin", "moderator"]);
      requirePage(pages, "Hosts");
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const acceptingCalls =
        typeof body.accepting_calls === "boolean" ? body.accepting_calls : null;
      if (!/^\+91\d{10}$/.test(phone) || acceptingCalls === null)
        throw new Error("Choose an approved Host and a valid availability state.");

      const { data: host, error: hostError } = await admin
        .from("host_applications")
        .select("id,status")
        .eq("phone", phone)
        .maybeSingle();
      if (hostError || !host)
        throw hostError || new Error("Host application was not found.");
      if (host.status !== "approved")
        throw new Error("Only approved Hosts can be set online or offline.");

      const { data: previousPresence, error: presenceError } = await admin
        .from("phone_host_presence")
        .select("accepting_calls")
        .eq("host_phone", phone)
        .maybeSingle();
      if (presenceError) throw presenceError;

      const { error: availabilityError } = await admin.rpc(
        "set_phone_host_call_availability",
        {
          input_host_phone: phone,
          input_accepting_calls: acceptingCalls,
        },
      );
      if (availabilityError) throw availabilityError;

      const { error: auditError } = await admin.from("admin_audit_logs").insert({
        admin_user_id: user.id,
        action: "host_call_availability_changed",
        entity_type: "host_application",
        entity_id: phone,
        before_state: {
          accepting_calls: previousPresence?.accepting_calls === true,
        },
        after_state: { accepting_calls: acceptingCalls },
      });
      if (auditError) throw auditError;
      return reply({ ok: true, accepting_calls: acceptingCalls });
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
      const {data:existing,error:existingError}=await admin.from("host_applications").select("application_profile").eq("phone",phone).maybeSingle(); if(existingError) throw existingError; const existingProfile=existing?.application_profile&&typeof existing.application_profile==="object"&&!Array.isArray(existing.application_profile)?existing.application_profile as Record<string,unknown>:{}; const pendingPhoto=typeof existingProfile.photo_review_id==="string"; if(approve&&pendingPhoto) throw new Error("Approve this Host from the Hosts review action so the pending photo is published safely."); const applicationProfile={...existingProfile,name:profile.display_name||"Host",bio:profile.bio||"",languages:profile.languages||[],interests:profile.interests||[],...(!pendingPhoto?{photo:profile.avatar_url||null}:{}),aadhaarDocument:"Verified by admin",panDocument:"Verified by admin",audio:true,video:true,audioRate:"2",videoRate:"5",onboardedByAdminId:user.id};
      const {error:onboardingError}=await admin.rpc("admin_assist_host_onboarding",{input_phone:phone,input_application_profile:applicationProfile,input_pan_last4:pan.slice(-4),input_aadhaar_last4:aadhaar.slice(-4),input_payout:{account_holder_name:holder,payout_method:method,account_number:method==="bank"?account:null,ifsc_code:method==="bank"?ifsc:null,upi_id:method==="upi"?upi:null},input_admin_user_id:user.id,input_approve:approve,input_payout_verified:payoutVerified}); if(onboardingError) throw onboardingError; return reply({ok:true});
    }
    if (action === "review_host") {
      requireRole(role, ["super_admin", "moderator"]); const id = typeof body.id === "string" ? body.id : ""; const status = typeof body.status === "string" ? body.status : "";
      requirePage(pages, "Hosts");
      if (!id || !["approved", "rejected", "inactive", "archived"].includes(status)) throw new Error("Choose a valid Host status.");
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (status === "approved") {
        const { data: application, error: applicationError } = await admin
          .from("host_applications")
          .select("id,phone,status,application_profile")
          .eq("id", id)
          .maybeSingle();
        if (applicationError || !application)
          throw applicationError || new Error("Host application was not found.");
        const applicationProfile = application.application_profile
          && typeof application.application_profile === "object"
          && !Array.isArray(application.application_profile)
          ? application.application_profile as Record<string, unknown>
          : {};
        const photoReviewId = applicationProfile.photo_review_id;
        let publicPhotoUrl = typeof applicationProfile.photo === "string"
          && /^https?:\/\//i.test(applicationProfile.photo)
          ? applicationProfile.photo
          : null;
        let publishedPhotoPath: string | null = null;
        if (photoReviewId !== undefined) {
          if (typeof photoReviewId !== "string"
            || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photoReviewId)) {
            throw new Error("The pending Host photo reference is invalid.");
          }
          const { data: photo, error: photoError } = await admin
            .from("phone_content_moderation_items")
            .select("id,owner_phone,storage_bucket,storage_path,media_type,status,content_type,public_url")
            .eq("id", photoReviewId)
            .maybeSingle();
          if (photoError || !photo)
            throw photoError || new Error("The pending Host photo was not found.");
          if (photo.owner_phone !== application.phone || photo.content_type !== "profile_photo")
            throw new Error("The pending Host photo does not belong to this application.");

          if (photo.status === "approved" && photo.public_url) {
            publicPhotoUrl = photo.public_url;
          } else {
            const mediaType = typeof photo.media_type === "string"
              ? photo.media_type
              : fileTypeFromSuffix(photo.storage_path || "");
            if (
              photo.status !== "needs_review"
              || photo.storage_bucket !== "moderation-media"
              || typeof photo.storage_path !== "string"
              || !mediaType
              || !hostImageTypes.has(mediaType)
            ) throw new Error("The pending Host photo is unavailable. Ask the Host to submit a new photo.");

            const digits = photo.owner_phone.replace(/\D/g, "");
            const expectedPath = new RegExp(`^${digits}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "i");
            if (!expectedPath.test(photo.storage_path))
              throw new Error("Host photo storage path is invalid.");
            const { data: file, error: downloadError } = await admin.storage
              .from("moderation-media").download(photo.storage_path);
            if (downloadError || !file)
              throw downloadError || new Error("The private Host photo could not be opened.");
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (!hasValidFileSignature(bytes, mediaType))
              throw new Error("The stored Host photo does not match its image type.");

            publishedPhotoPath = `${digits}/${crypto.randomUUID()}.${fileSuffix(mediaType)}`;
            const { error: publishError } = await admin.storage.from("host-photos").upload(
              publishedPhotoPath,
              bytes,
              { contentType: mediaType, upsert: false },
            );
            if (publishError) throw publishError;
            publicPhotoUrl = admin.storage.from("host-photos")
              .getPublicUrl(publishedPhotoPath).data.publicUrl;
          }
        }

        const { error: approveError } = await admin.rpc("admin_approve_host_application", {
          input_application_id: id,
          input_photo_review_id: typeof photoReviewId === "string" ? photoReviewId : null,
          input_public_photo_url: publicPhotoUrl,
          input_admin_user_id: user.id,
          input_review_note: note || null,
        });
        if (approveError) {
          if (publishedPhotoPath) {
            const { error: cleanupError } = await admin.storage
              .from("host-photos").remove([publishedPhotoPath]);
            if (cleanupError) console.error("Uncommitted Host photo cleanup failed:", cleanupError.message);
          }
          throw approveError;
        }
        return reply({ ok: true });
      }

      const reviewedAt = new Date().toISOString();
      const { data: updated, error } = await admin.from("host_applications")
        .update({
          status,
          reviewed_at: reviewedAt,
          review_note: note || null,
          archived_at: status === "archived" ? reviewedAt : null,
        })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error || !updated) throw error || new Error("Host application was not found.");
      const { error: auditError } = await admin.from("admin_audit_logs").insert({
        admin_user_id: user.id,
        action: "host_reviewed",
        entity_type: "host_application",
        entity_id: id,
        after_state: { status },
      });
      if (auditError) throw auditError;
      return reply({ ok: true });
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
    if (action === "list_users") {
      requireRole(role, ["super_admin", "moderator", "support"]);
      requirePage(pages, "Users");
      const { data: profiles, error: profileError } = await admin
        .from("phone_profiles")
        .select("phone,display_name,username,gender,date_of_birth,city,bio,languages,interests,avatar_url,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(150);
      if (profileError) throw profileError;

      const phones = (profiles || []).map((profile) => profile.phone);
      const [
        { data: statuses, error: statusError },
        { data: applications, error: applicationError },
        { data: userPresence, error: userPresenceError },
        { data: hostPresence, error: hostPresenceError },
        { data: callerCalls, error: callerCallsError },
        { data: hostCalls, error: hostCallsError },
      ] = await Promise.all([
        phones.length
          ? admin
              .from("phone_user_admin_status")
              .select("phone,status,updated_at,archived_at")
              .in("phone", phones)
          : Promise.resolve({ data: [], error: null }),
        phones.length
          ? admin
              .from("host_applications")
              .select("phone,status")
              .in("phone", phones)
          : Promise.resolve({ data: [], error: null }),
        phones.length
          ? admin
              .from("phone_user_presence")
              .select("phone,last_seen_at")
              .in("phone", phones)
          : Promise.resolve({ data: [], error: null }),
        phones.length
          ? admin
              .from("phone_host_presence")
              .select("host_phone,last_seen_at")
              .in("host_phone", phones)
          : Promise.resolve({ data: [], error: null }),
        phones.length
          ? admin
              .from("call_sessions")
              .select("caller_phone,host_phone,call_type,connected_at")
              .in("caller_phone", phones)
              .eq("status", "connected")
          : Promise.resolve({ data: [], error: null }),
        phones.length
          ? admin
              .from("call_sessions")
              .select("caller_phone,host_phone,call_type,connected_at")
              .in("host_phone", phones)
              .eq("status", "connected")
          : Promise.resolve({ data: [], error: null }),
      ]);
      const failedQuery =
        statusError ??
        applicationError ??
        userPresenceError ??
        hostPresenceError ??
        callerCallsError ??
        hostCallsError;
      if (failedQuery) throw failedQuery;

      const statusesByPhone = new Map(
        (statuses || []).map((status) => [status.phone, status]),
      );
      const approvedHosts = new Set(
        (applications || [])
          .filter((application) => application.status === "approved")
          .map((application) => application.phone),
      );
      const userPresenceByPhone = new Map(
        (userPresence || []).map((record) => [record.phone, record.last_seen_at]),
      );
      const hostPresenceByPhone = new Map(
        (hostPresence || []).map((record) => [
          record.host_phone,
          record.last_seen_at,
        ]),
      );
      const callsByPhone = new Map<
        string,
        { call_type: string; connected_at: string | null }
      >();
      for (const call of [...(callerCalls || []), ...(hostCalls || [])]) {
        const activeCall = {
          call_type: call.call_type,
          connected_at: call.connected_at,
        };
        callsByPhone.set(call.caller_phone, activeCall);
        callsByPhone.set(call.host_phone, activeCall);
      }

      const onlineThreshold = Date.now() - 60000;
      return reply({
        items: (profiles || []).map((profile) => {
          const isHost = approvedHosts.has(profile.phone);
          const lastSeenAt = isHost
            ? hostPresenceByPhone.get(profile.phone) || null
            : userPresenceByPhone.get(profile.phone) || null;
          const accountStatus = statusesByPhone.get(profile.phone)?.status;
          const activeCall = callsByPhone.get(profile.phone);
          return {
            ...profile,
            account_status: accountStatus || "active",
            account_status_updated_at:
              statusesByPhone.get(profile.phone)?.updated_at || null,
            is_host: isHost,
            last_seen_at: lastSeenAt,
            is_online:
              !!lastSeenAt &&
              Date.parse(lastSeenAt) >= onlineThreshold &&
              (!accountStatus || accountStatus === "active"),
            is_in_call: Boolean(activeCall),
            active_call_type: activeCall?.call_type || null,
            active_call_started_at: activeCall?.connected_at || null,
          };
        }),
      });
    }
    if (action === "list_account_deletion_requests") {
      requireRole(role, ["super_admin", "support"]);
      requirePage(pages, "Account deletions");
      const { data: requests, error: requestError } = await admin
        .from("phone_account_deletion_requests")
        .select("phone,reason,details,status,requested_at,scheduled_for,reviewed_at,reviewed_by,review_note")
        .order("requested_at", { ascending: false })
        .limit(200);
      if (requestError) throw requestError;
      const phones = (requests || []).map((item) => item.phone);
      const { data: profiles, error: profileError } = phones.length
        ? await admin.from("phone_profiles").select("phone,display_name,username").in("phone", phones)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const profilesByPhone = new Map((profiles || []).map((profile) => [profile.phone, profile]));
      return reply({
        items: (requests || []).map((item) => ({
          ...item,
          profile: profilesByPhone.get(item.phone) || null,
        })),
      });
    }
    if (action === "review_account_deletion_request") {
      requireRole(role, ["super_admin", "support"]);
      requirePage(pages, "Account deletions");
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const status = typeof body.status === "string" ? body.status : "";
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (!/^\+91\d{10}$/.test(phone) || !["processing", "cancelled"].includes(status))
        throw new Error("Choose a valid account-deletion request and review status.");
      if (note.length > 2000) throw new Error("Keep the review note under 2,000 characters.");
      const { data: before, error: beforeError } = await admin
        .from("phone_account_deletion_requests")
        .select("phone,reason,details,status,requested_at,scheduled_for")
        .eq("phone", phone)
        .maybeSingle();
      if (beforeError || !before) throw beforeError || new Error("Account-deletion request was not found.");
      if (before.status === "completed" || before.status === "cancelled")
        throw new Error("This account-deletion request is already closed.");
      const reviewedAt = new Date().toISOString();
      const { error: updateError } = await admin
        .from("phone_account_deletion_requests")
        .update({
          status,
          reviewed_at: reviewedAt,
          reviewed_by: user.id,
          review_note: note || null,
        })
        .eq("phone", phone);
      if (updateError) throw updateError;
      const { error: auditError } = await admin.from("admin_audit_logs").insert({
        admin_user_id: user.id,
        action: "account_deletion_request_reviewed",
        entity_type: "account_deletion_request",
        entity_id: phone,
        before_state: before,
        after_state: { status, note: note || null },
      });
      if (auditError) throw auditError;
      return reply({ ok: true });
    }
    if (action === "set_user_status") { requireRole(role,["super_admin","moderator"]); requirePage(pages,"Users"); const phone=typeof body.phone === "string"?body.phone:""; const status=typeof body.status === "string"?body.status:""; if(!phone||!["active","suspended","inactive","archived"].includes(status))throw new Error("Invalid user status."); const {error}=await admin.from("phone_user_admin_status").upsert({phone,status,reason:typeof body.reason === "string"?body.reason:null,updated_by:user.id,updated_at:new Date().toISOString(),archived_at:status==="archived"?new Date().toISOString():null},{onConflict:"phone"});if(error)throw error;await admin.from("admin_audit_logs").insert({admin_user_id:user.id,action:"user_status_changed",entity_type:"phone_user",entity_id:phone,after_state:{status}});return reply({ok:true}); }
    if (action === "list_safety") {
      requireRole(role, ["super_admin", "moderator"]);
      requirePage(pages, "Reports");
      const [
        { data: reports, error: reportsError },
        { data: photos, error: photosError },
        { data: applications, error: applicationsError },
      ] = await Promise.all([
        admin.from("safety_reports")
          .select("id,reporter_name,reported_user_id,reported_user_name,reason,details,status,resolution_note,created_at")
          .order("created_at", { ascending: false }).limit(100),
        admin.from("phone_content_moderation_items")
          .select("id,owner_phone,storage_bucket,storage_path,status,decision_note,created_at")
          .eq("content_type", "profile_photo").eq("status", "needs_review")
          .order("created_at", { ascending: false }).limit(100),
        admin.from("host_applications")
          .select("application_profile")
          .limit(1000),
      ]);
      if (reportsError || photosError || applicationsError) throw reportsError || photosError || applicationsError;
      const linkedHostPhotoIds = new Set((applications || []).flatMap((application) => {
        const profile = application.application_profile
          && typeof application.application_profile === "object"
          && !Array.isArray(application.application_profile)
          ? application.application_profile as Record<string, unknown>
          : {};
        return typeof profile.photo_review_id === "string" ? [profile.photo_review_id] : [];
      }));
      const photoPhones = [...new Set((photos || []).map((item) => item.owner_phone))];
      const [
        { data: photoProfiles, error: photoProfilesError },
        { data: latestPhotoItems, error: latestPhotoItemsError },
      ] = photoPhones.length
        ? await Promise.all([
            admin.from("phone_profiles")
              .select("phone,display_name,username,gender")
              .in("phone", photoPhones),
            admin.from("phone_content_moderation_items")
              .select("id,owner_phone")
              .eq("content_type", "profile_photo")
              .in("owner_phone", photoPhones)
              .order("owner_phone", { ascending: true })
              .order("created_at", { ascending: false })
              .order("id", { ascending: false })
              .limit(1000),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];
      if (photoProfilesError || latestPhotoItemsError)
        throw photoProfilesError || latestPhotoItemsError;
      const profilesByPhone = new Map((photoProfiles || []).map((profile) => [
        profile.phone,
        profile,
      ]));
      const latestPhotoIdByPhone = new Map<string, string>();
      for (const item of latestPhotoItems || []) {
        if (!latestPhotoIdByPhone.has(item.owner_phone))
          latestPhotoIdByPhone.set(item.owner_phone, item.id);
      }
      const reportIds = (reports || []).map((item) => item.id);
      const { data: notes, error: noteError } = reportIds.length
        ? await admin.from("admin_moderation_notes")
          .select("id,entity_id,note,created_by,created_at")
          .eq("entity_type", "safety_report").in("entity_id", reportIds)
          .order("created_at", { ascending: false })
        : { data: [], error: null };
      if (noteError) throw noteError;
      const notesById = new Map<string, unknown[]>();
      for (const note of notes || []) {
        const values = notesById.get(note.entity_id) || [];
        values.push(note);
        notesById.set(note.entity_id, values);
      }
      const photoReviews = await Promise.all((photos || []).filter((item) =>
        !linkedHostPhotoIds.has(item.id)
        && latestPhotoIdByPhone.get(item.owner_phone) === item.id
      ).map(async (item) => {
        const digits = item.owner_phone.replace(/\D/g, "");
        const expectedPath = new RegExp(`^${digits}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "i");
        if (
          item.storage_bucket !== "moderation-media"
          || typeof item.storage_path !== "string"
          || !expectedPath.test(item.storage_path)
        ) throw new Error("A pending profile photo has invalid private storage metadata.");
        const { data: signed, error: signedError } = await admin.storage
          .from("moderation-media").createSignedUrl(item.storage_path, 300);
        if (signedError || !signed?.signedUrl)
          throw signedError || new Error("Could not prepare a private profile photo preview.");
        const profile = profilesByPhone.get(item.owner_phone);
        return {
          id: item.id,
          record_type: "profile_photo_review",
          display_name: profile?.display_name || "Member",
          username: profile?.username || null,
          gender: profile?.gender || "Member",
          phone: item.owner_phone,
          owner_phone: item.owner_phone,
          reason: "Profile photo needs manual safety review",
          details: item.decision_note,
          status: item.status,
          created_at: item.created_at,
          preview_url: signed.signedUrl,
        };
      }));
      const reportItems = (reports || []).map((item) => ({
        ...item,
        moderation_notes: notesById.get(item.id) || [],
      }));
      return reply({
        items: [...photoReviews, ...reportItems].sort((a, b) =>
          String(b.created_at || "").localeCompare(String(a.created_at || ""))
        ),
      });
    }
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
    if (action === "review_profile_photo") {
      requireRole(role, ["super_admin", "moderator"]);
      requirePage(pages, "Reports");
      const id = typeof body.id === "string" ? body.id : "";
      const decision = typeof body.decision === "string" ? body.decision : "";
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        || !["approved", "rejected"].includes(decision)
        || !note
        || note.length > 2000
      )
        throw new Error("Choose a photo decision and add a review note.");
      const { data: before, error: beforeError } = await admin
        .from("phone_content_moderation_items")
        .select("id,owner_phone,storage_bucket,storage_path,media_type,status,content_type")
        .eq("id", id).maybeSingle();
      if (beforeError || !before)
        throw beforeError || new Error("Profile photo review item was not found.");
      const mediaType = typeof before.media_type === "string"
        ? before.media_type
        : fileTypeFromSuffix(before.storage_path || "");
      if (
        before.content_type !== "profile_photo"
        || before.storage_bucket !== "moderation-media"
        || before.status !== "needs_review"
        || typeof before.storage_path !== "string"
        || !mediaType
        || !hostImageTypes.has(mediaType)
      ) throw new Error("This profile photo is not awaiting review.");

      const digits = before.owner_phone.replace(/\D/g, "");
      const expectedPath = new RegExp(`^${digits}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "i");
      if (!expectedPath.test(before.storage_path))
        throw new Error("Profile photo storage path is invalid.");

      let publicPhotoPath: string | null = null;
      if (decision === "approved") {
        const { data: photo, error: downloadError } = await admin.storage
          .from("moderation-media").download(before.storage_path);
        if (downloadError || !photo)
          throw downloadError || new Error("The private profile photo could not be opened.");
        const bytes = new Uint8Array(await photo.arrayBuffer());
        if (!hasValidFileSignature(bytes, mediaType))
          throw new Error("The stored profile photo does not match its image type.");
        publicPhotoPath = `${digits}/${crypto.randomUUID()}.${fileSuffix(mediaType)}`;
        const { error: publishError } = await admin.storage.from("host-photos").upload(
          publicPhotoPath,
          bytes,
          { contentType: mediaType, upsert: false },
        );
        if (publishError) throw publishError;
      }

      const publicUrl = publicPhotoPath
        ? admin.storage.from("host-photos").getPublicUrl(publicPhotoPath).data.publicUrl
        : null;
      const { error: reviewError } = await admin.rpc("review_admin_profile_photo", {
        input_item_id: id,
        input_actor_uid: user.id,
        input_decision: decision,
        input_review_note: note,
        input_public_photo_url: publicUrl,
      });
      if (reviewError) {
        if (publicPhotoPath) {
          const { error: cleanupError } = await admin.storage
            .from("host-photos").remove([publicPhotoPath]);
          if (cleanupError) console.error("Uncommitted Host photo cleanup failed:", cleanupError.message);
        }
        if (reviewError.code === "P0001" && reviewError.message === "profile_photo_superseded")
          throw new Error("A newer photo was submitted. Refresh the Reports queue before reviewing this one.");
        throw reviewError;
      }
      return reply({ ok: true, status: decision });
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
