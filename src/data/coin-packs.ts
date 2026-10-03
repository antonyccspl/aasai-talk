import { supabaseUrl, supabasePublishableKey } from './supabase-config';

export type CoinPack = {
  id: string;
  coins: number;
  price_paise: number;
  sort_order: number;
  bonus_coins: number;
  is_special: boolean;
  special_label: string | null;
  available_from: string | null;
  available_until: string | null;
};

export async function fetchCoinPacks(signal?: AbortSignal): Promise<CoinPack[]> {
  const url = supabaseUrl;
  const key = supabasePublishableKey;
  if (!url || !key) throw new Error('Connection configuration is missing.');
  const response = await fetch(
    `${url}/rest/v1/coin_packs?select=id,coins,price_paise,sort_order,bonus_coins,is_special,special_label,available_from,available_until&active=eq.true&order=sort_order.asc,id.asc`,
    { headers: { apikey: key }, signal },
  );
  if (!response.ok) throw new Error('Unable to load coin packs. Please try again.');
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || !rows.every(row =>
    typeof row.id === 'string' && Number.isSafeInteger(row.coins) && row.coins > 0 &&
    Number.isSafeInteger(row.price_paise) && row.price_paise > 0 &&
    Number.isSafeInteger(row.bonus_coins) && row.bonus_coins >= 0 &&
    typeof row.is_special === 'boolean' &&
    (typeof row.special_label === 'string' || row.special_label === null) &&
    (typeof row.available_from === 'string' || row.available_from === null) &&
    (typeof row.available_until === 'string' || row.available_until === null)
  )) throw new Error('Coin packs are temporarily unavailable.');
  return rows as CoinPack[];
}
