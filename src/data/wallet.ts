import { supabase } from "./supabase";

export async function fetchPhoneWalletBalance(phone: string) {
  const { data, error } = await supabase.rpc("get_phone_wallet_balance", {
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "number" || !Number.isSafeInteger(data) || data < 0)
    throw new Error("Invalid wallet balance returned by the server.");
  return data;
}
