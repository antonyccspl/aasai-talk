// Only the publishable key may be used in the client. Never add a secret/service-role key here.
export const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(
  /\/+$/,
  '',
);
export const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

export function assertSupabaseConfig() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Supabase configuration is missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
}
