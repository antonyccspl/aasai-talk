import { supabasePublishableKey, supabaseUrl } from './supabase-config';

export type DirectoryPerson = {
  id: string;
  name: string;
  age: number;
  gender: string;
  city: string;
  languages: string[];
  interests: string[];
  bio: string;
  status: 'Available' | 'Busy' | 'Offline';
  photo?: string;
  color: string;
  lastSeenAt?: string | null;
};

export type DirectoryStatus = DirectoryPerson['status'];

export function normalizePresenceStatus(
  value: unknown,
  fallback: DirectoryStatus = 'Offline',
): DirectoryStatus {
  return value === 'Available' || value === 'Busy' || value === 'Offline'
    ? value
    : fallback;
}

export function derivePresenceStatus({
  baseStatus,
  activeCallPersonId,
  currentPersonId,
  available = true,
}: {
  baseStatus?: string | null;
  activeCallPersonId?: string | null;
  currentPersonId?: string | null;
  available?: boolean;
}): DirectoryStatus {
  const normalized = normalizePresenceStatus(baseStatus);

  if (activeCallPersonId && currentPersonId && activeCallPersonId === currentPersonId) {
    return 'Busy';
  }

  if (!available) {
    return 'Offline';
  }

  return normalized;
}

type DirectoryRow = {
  id: string; display_name: string; age: number; gender: string; city: string;
  languages: string[]; interests: string[]; bio: string; availability: DirectoryPerson['status'];
  avatar_url: string | null; accent_color: string; last_seen_at: string | null;
};

export function formatLastSeen(value?: string | null) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d ago`;
  return new Date(timestamp).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export async function fetchDirectoryProfiles(signal?: AbortSignal): Promise<DirectoryPerson[]> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_directory_profiles`, {
    method: "POST",
    headers: { apikey: supabasePublishableKey, "Content-Type": "application/json" },
    body: "{}",
    signal,
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const serverMessage =
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string'
        ? payload.message
        : '';
    throw new Error(
      serverMessage
        ? `Supabase directory request failed (${response.status}): ${serverMessage}`
        : `Supabase directory request failed with HTTP ${response.status}.`,
    );
  }
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || !rows.every((row): row is DirectoryRow =>
    row && typeof row.id === 'string' && typeof row.display_name === 'string' &&
    Number.isSafeInteger(row.age) && typeof row.gender === 'string' && typeof row.city === 'string' &&
    Array.isArray(row.languages) && Array.isArray(row.interests) && typeof row.bio === 'string' &&
    ['Available', 'Busy', 'Offline'].includes(row.availability) && typeof row.accent_color === 'string' &&
    (row.avatar_url === null || typeof row.avatar_url === 'string') &&
    (row.last_seen_at === null || typeof row.last_seen_at === 'string')
  )) throw new Error('Invalid people directory.');
  return rows.map(row => ({ id: row.id, name: row.display_name, age: row.age, gender: row.gender, city: row.city,
    languages: row.languages, interests: row.interests, bio: row.bio, status: normalizePresenceStatus(row.availability),
    photo: row.avatar_url ?? undefined, color: row.accent_color, lastSeenAt: row.last_seen_at }));
}
