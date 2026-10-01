import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";

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
  return { phone, uid: payload.sub || "" };
}