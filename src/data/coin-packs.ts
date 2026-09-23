import { supabaseUrl, supabasePublishableKey } from './supabase-config';

export type CoinPack = {
  id: string;
  coins: number;
  price_paise: number;
  sort_order: number;
};

export async function fetchCoinPacks(signal?: AbortSignal): Promise<CoinPack[]> {
  const url = supabaseUrl;
  const key = supabasePublishableKey;
  if (!url || !key) throw new Error('Connection configuration is missing.');
  const response = await fetch(
    `${url}/rest/v1/coin_packs?select=id,coins,price_paise,sort_order&active=eq.true&order=sort_order.asc,id.asc`,
    { headers: { apikey: key }, signal },
  );
  if (!response.ok) throw new Error('Unable to load coin packs. Please try again.');
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || !rows.every(row =>
    typeof row.id === 'string' && Number.isSafeInteger(row.coins) && row.coins > 0 &&
    Number.isSafeInteger(row.price_paise) && row.price_paise > 0
  )) throw new Error('Coin packs are temporarily unavailable.');
  return rows as CoinPack[];
}
