import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  assertSupabaseConfig,
  supabasePublishableKey,
  supabaseUrl,
} from './supabase-config';

assertSupabaseConfig();

const storage = {
  getItem: async (key: string) =>
    Platform.OS === 'web'
      ? globalThis.localStorage.getItem(key)
      : SecureStore.getItemAsync(key),
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') globalThis.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string) => {
    if (Platform.OS === 'web') globalThis.localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export async function withSupabaseRequestTimeout<T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = 15000,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let externalAbort: (() => void) | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(
        new Error(
          `Supabase request_timeout: request did not complete within ${timeoutMs} ms.`,
        ),
      );
    }, timeoutMs);
  });
  const externalAbortPromise = externalSignal
    ? new Promise<never>((_, reject) => {
        externalAbort = () => {
          controller.abort();
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          reject(error);
        };
        if (externalSignal.aborted) externalAbort();
        else externalSignal.addEventListener('abort', externalAbort, { once: true });
      })
    : new Promise<never>(() => {});
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) {
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          throw error;
        }
        return request(controller.signal);
      }),
      timeoutPromise,
      externalAbortPromise,
    ]);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
    if (externalSignal && externalAbort)
      externalSignal.removeEventListener('abort', externalAbort);
  }
}
