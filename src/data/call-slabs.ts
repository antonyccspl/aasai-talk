import { supabaseUrl, supabasePublishableKey } from './supabase-config';

export type CallSlab = {
  id: string;
  call_type: 'AUDIO' | 'VIDEO';
  min_minutes: number;
  max_minutes: number | null;
  diamonds_per_minute: number;
  coins_per_diamond: number;
  coins_per_rupee: number;
};

export async function fetchCallSlabs(signal: AbortSignal): Promise<CallSlab[]> {
  const url = supabaseUrl;
  const key = supabasePublishableKey;
  if (!url || !key) throw new Error('Missing Supabase configuration');
  const response = await fetch(
    `${url}/rest/v1/receiver_coin_diamond_slabs?select=id,call_type,min_minutes,max_minutes,diamonds_per_minute,coins_per_diamond,coins_per_rupee&is_active=eq.true&order=call_type,min_minutes`,
    { headers: { apikey: key }, signal },
  );
  if (!response.ok) throw new Error('Call rates unavailable');
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.every(row =>
    typeof row.id === 'string' && ['AUDIO', 'VIDEO'].includes(row.call_type) &&
    typeof row.min_minutes === 'number' &&
    (row.max_minutes === null || typeof row.max_minutes === 'number') &&
    [row.diamonds_per_minute, row.coins_per_diamond, row.coins_per_rupee]
      .every(value => typeof value === 'number' && Number.isFinite(value))
  )) throw new Error('Invalid call rates');
  return rows;
}
