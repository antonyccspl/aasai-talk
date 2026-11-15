export function fileSuffix(type: string) {
  switch (type) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "application/pdf": return "pdf";
    default: throw new Error("This file type is not supported.");
  }
}

export function fileTypeFromSuffix(path: string) {
  const suffix = path.split(".").pop()?.toLowerCase();
  switch (suffix) {
    case "jpg": case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    default: return null;
  }
}

export function hasValidFileSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png")
    return bytes.subarray(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  if (type === "image/webp")
    return new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF"
      && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
  if (type === "application/pdf")
    return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  return false;
}
