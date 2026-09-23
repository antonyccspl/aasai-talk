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
};

type DirectoryRow = {
  id: string; display_name: string; age: number; gender: string; city: string;
  languages: string[]; interests: string[]; bio: string; availability: DirectoryPerson['status'];
  avatar_url: string | null; accent_color: string;
};

export async function fetchDirectoryProfiles(signal?: AbortSignal): Promise<DirectoryPerson[]> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_directory_profiles`, {
    method: "POST",
    headers: { apikey: supabasePublishableKey, "Content-Type": "application/json" },
    body: "{}",
    signal,
  });
  if (!response.ok) throw new Error('Unable to load people.');
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || !rows.every((row): row is DirectoryRow =>
    row && typeof row.id === 'string' && typeof row.display_name === 'string' &&
    Number.isSafeInteger(row.age) && typeof row.gender === 'string' && typeof row.city === 'string' &&
    Array.isArray(row.languages) && Array.isArray(row.interests) && typeof row.bio === 'string' &&
    ['Available', 'Busy', 'Offline'].includes(row.availability) && typeof row.accent_color === 'string' &&
    (row.avatar_url === null || typeof row.avatar_url === 'string')
  )) throw new Error('Invalid people directory.');
  return rows.map(row => ({ id: row.id, name: row.display_name, age: row.age, gender: row.gender, city: row.city,
    languages: row.languages, interests: row.interests, bio: row.bio, status: row.availability,
    photo: row.avatar_url ?? undefined, color: row.accent_color }));
}
