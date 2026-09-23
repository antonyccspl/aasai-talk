import { supabasePublishableKey, supabaseUrl } from './supabase-config';

export type Announcement = {
  id: string;
  title: string;
  message: string;
  audience: string;
  tag: string;
  is_active: boolean;
  created_at: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  path: string;
  icon: 'message-circle' | 'video' | 'credit-card' | 'radio' | 'shield';
  is_global: boolean;
  created_at: string;
};

export type PolicySection = {
  title: string;
  description: string;
};

export type PolicyDocument = {
  key: string;
  title: string;
  category: 'policy';
  content: PolicySection[];
};

export type AppConfig = {
  maintenance_mode: boolean;
  maintenance_message: string;
  minimum_app_version: string;
  support_email: string;
  support_phone: string;
  new_user_bonus_coins: number;
  audio_rate_diamonds_per_min: number;
  video_rate_diamonds_per_min: number;
  coins_per_diamond: number;
};

export type SafetyReport = {
  id: string;
  reporter_name: string;
  reported_user_id: string;
  reported_user_name: string;
  reason: string;
  details: string;
  status: 'Open' | 'Under review' | 'Resolved' | 'Rejected';
  resolution_note: string | null;
  created_at: string;
};

export type DbTransaction = {
  id: string;
  title: string;
  amount: number;
  kind: 'Recharges' | 'Calls' | 'Bonus';
  status: 'Success' | 'Completed' | 'Processing' | 'Failed';
  date: string;
  created_at: string;
};

export type DbCall = {
  id: string;
  person_id: string;
  person_name: string;
  call_type: 'audio' | 'video';
  status: 'Ended' | 'Missed' | 'Rejected' | 'Busy';
  seconds: number;
  incoming: boolean;
  created_at: string;
};

export type DbMessage = {
  id: string;
  conversation_with: string;
  sender_name: string;
  is_mine: boolean;
  text: string;
  created_at: string;
};

export type PlatformMetric = {
  metric_key: string;
  metric_label: string;
  metric_value: string;
  sub_text: string | null;
  chart_data: number[] | null;
};

async function queryTable<T>(endpoint: string, signal?: AbortSignal): Promise<T[]> {
  const url = `${supabaseUrl}/rest/v1/${endpoint}`;
  const response = await fetch(url, {
    headers: {
      apikey: supabasePublishableKey,
      'Content-Type': 'application/json',
    },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to load ${endpoint}: ${response.status}`);
  }
  return (await response.json()) as T[];
}

export async function fetchAnnouncements(signal?: AbortSignal): Promise<Announcement[]> {
  return queryTable<Announcement>('announcements?is_active=eq.true&order=created_at.desc', signal);
}

export async function fetchNotifications(signal?: AbortSignal): Promise<NotificationItem[]> {
  return queryTable<NotificationItem>('notifications?is_global=eq.true&order=created_at.desc', signal);
}

export async function fetchPoliciesAndSettings(
  signal?: AbortSignal
): Promise<{ policies: Record<string, PolicySection[]>; config: AppConfig | null }> {
  type Row = { key: string; title: string; category: string; content: unknown };
  const rows = await queryTable<Row>('app_policies_and_settings?select=*', signal);
  const policies: Record<string, PolicySection[]> = {};
  let config: AppConfig | null = null;

  for (const row of rows) {
    if (row.category === 'policy' && Array.isArray(row.content)) {
      policies[row.key] = row.content as PolicySection[];
    } else if (row.key === 'app_config' && typeof row.content === 'object' && row.content !== null) {
      config = row.content as AppConfig;
    }
  }

  return { policies, config };
}

export async function fetchSafetyReports(signal?: AbortSignal): Promise<SafetyReport[]> {
  return queryTable<SafetyReport>('safety_reports?order=created_at.desc', signal);
}

export async function fetchTransactions(signal?: AbortSignal): Promise<DbTransaction[]> {
  return queryTable<DbTransaction>('transactions?order=created_at.desc', signal);
}

export async function fetchCalls(signal?: AbortSignal): Promise<DbCall[]> {
  return queryTable<DbCall>('calls?order=created_at.desc', signal);
}

export async function fetchMessages(signal?: AbortSignal): Promise<DbMessage[]> {
  return queryTable<DbMessage>('messages?order=created_at.asc', signal);
}

export async function fetchPlatformMetrics(signal?: AbortSignal): Promise<PlatformMetric[]> {
  return queryTable<PlatformMetric>('platform_metrics?select=*', signal);
}
