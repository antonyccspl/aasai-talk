const likelihoods = ["UNKNOWN", "VERY_UNLIKELY", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY"];

function decisionFor(adult: string, racy: string) {
  const adultScore = likelihoods.indexOf(adult);
  const racyScore = likelihoods.indexOf(racy);
  if (adultScore >= 4) return "rejected" as const;
  if (adultScore >= 3 || racyScore >= 4) return "needs_review" as const;
  return "approved" as const;
}

function base64Encode(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

export async function scanImageWithGoogleVision(bytes: Uint8Array) {
  const key = Deno.env.get("GOOGLE_VISION_API_KEY");
  if (!key)
    return {
      provider: "manual",
      status: "needs_review" as const,
      adult: "UNKNOWN",
      racy: "UNKNOWN",
      result: { reason: "Scanner not configured" },
    };
  const encoded = base64Encode(bytes);
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: encoded },
            features: [{ type: "SAFE_SEARCH_DETECTION" }],
          },
        ],
      }),
    },
  );
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok) {
    const serviceError = payload?.error;
    const detail =
      serviceError &&
      typeof serviceError === "object" &&
      typeof (serviceError as Record<string, unknown>).message === "string"
        ? (serviceError as Record<string, unknown>).message
        : `Google Vision returned ${response.status}.`;
    throw new Error(`The image safety scan could not be completed: ${detail}`);
  }
  const responses = Array.isArray(payload?.responses) ? payload.responses : [];
  const annotation =
    responses[0] &&
    typeof responses[0] === "object" &&
    (responses[0] as Record<string, unknown>).safeSearchAnnotation &&
    typeof (responses[0] as Record<string, unknown>).safeSearchAnnotation ===
      "object"
      ? ((responses[0] as Record<string, unknown>)
          .safeSearchAnnotation as Record<string, unknown>)
      : {};
  const adult = typeof annotation.adult === "string" ? annotation.adult : "UNKNOWN";
  const racy = typeof annotation.racy === "string" ? annotation.racy : "UNKNOWN";
  return {
    provider: "google_vision",
    status: decisionFor(adult, racy),
    adult,
    racy,
    result: annotation,
  };
}
