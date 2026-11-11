import { webcrypto } from "node:crypto";

const pair = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const publicKey = Buffer.from(await webcrypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url");
const privateJwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);

console.log(JSON.stringify({ publicKey, privateKey: privateJwk.d }));
