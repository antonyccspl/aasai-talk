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

export async function rechargePhoneWallet(
  phone: string,
  coins: number,
  clientOrderId: string,
) {
  const { data, error } = await supabase.rpc("recharge_phone_wallet", {
    input_phone: phone,
    input_coins: coins,
    input_client_order_id: clientOrderId,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("Invalid recharge response.");
  const row = data as Record<string, unknown>;
  if (
    typeof row.credited !== "boolean" ||
    typeof row.already_credited !== "boolean" ||
    typeof row.coins_credited !== "number" ||
    typeof row.remaining_coins !== "number" ||
    !Number.isSafeInteger(row.remaining_coins) ||
    row.remaining_coins < 0
  )
    throw new Error("Invalid recharge response.");
  return row as {
    credited: boolean;
    already_credited: boolean;
    coins_credited: number;
    remaining_coins: number;
  };
}
