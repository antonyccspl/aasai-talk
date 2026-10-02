import { supabase } from "./supabase";

export type PhoneWalletActivity = {
  id: string;
  title: string;
  coin_delta: number;
  category: "Recharges" | "Calls";
  status: string;
  created_at: string;
};

export async function fetchPhoneWalletBalance(phone: string) {
  const { data, error } = await supabase.rpc("get_phone_wallet_balance", {
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "number" || !Number.isSafeInteger(data) || data < 0)
    throw new Error("Invalid wallet balance returned by the server.");
  return data;
}

export async function fetchPhoneWalletActivity(
  phone: string,
  limit = 50,
): Promise<PhoneWalletActivity[]> {
  const { data, error } = await supabase.rpc("get_phone_wallet_activity", {
    input_phone: phone,
    input_limit: limit,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error("Invalid wallet activity returned by the server.");
  if (!data.every((row) => {
    if (!row || typeof row !== "object") return false;
    const value = row as Record<string, unknown>;
    return typeof value.id === "string" &&
      typeof value.title === "string" &&
      typeof value.coin_delta === "number" && Number.isSafeInteger(value.coin_delta) &&
      (value.category === "Recharges" || value.category === "Calls") &&
      typeof value.status === "string" && typeof value.created_at === "string";
  })) throw new Error("Wallet activity is temporarily unavailable.");
  return data as PhoneWalletActivity[];
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
