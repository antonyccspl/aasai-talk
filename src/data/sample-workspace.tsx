import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { supabaseUrl, supabasePublishableKey } from './supabase-config';
import { DirectoryPerson, fetchDirectoryProfiles } from './directory';
import {
  Announcement,
  AppConfig,
  fetchAnnouncements,
  fetchNotifications,
  fetchPlatformMetrics,
  fetchPoliciesAndSettings,
  fetchSafetyReports,
  fetchCalls,
  fetchMessages,
  fetchTransactions,
  NotificationItem,
  DbCall,
  DbMessage,
  DbTransaction,
  PlatformMetric,
  PolicySection,
  SafetyReport,
} from './platform-data';
import { colors as c } from '../ui/theme';
import { useAuth } from './auth';

type Snapshot = Record<string, unknown>;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

type Workspace = { state: Snapshot; revision: number };

type PlatformContextValue = {
  state: Snapshot;
  people: DirectoryPerson[];
  announcements: Announcement[];
  notifications: NotificationItem[];
  policies: Record<string, PolicySection[]>;
  appConfig: AppConfig | null;
  safetyReports: SafetyReport[];
  platformMetrics: Record<string, PlatformMetric>;
  refreshPeople: () => Promise<void>;
  refreshPlatformData: () => Promise<void>;
  change: (key: string, update: React.SetStateAction<any>) => void;
};

const Context = createContext<PlatformContextValue | null>(null);

async function rpc(name: string, body: object) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: supabasePublishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(
        response.status === 400
          ? 'Save conflict. Keep this screen open and try again.'
          : 'Unable to connect. Check your internet connection.'
      );
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

let tokenPromise: Promise<string> | undefined;
let tokenPromiseKey: string | undefined;
function workspaceToken(identityKey: string) {
  if (tokenPromiseKey !== identityKey) {
    tokenPromise = undefined;
    tokenPromiseKey = identityKey;
  }
  return (tokenPromise ??= (async () => {
    const safeIdentityKey = identityKey.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `aasai-demo-workspace-v2-${safeIdentityKey}`;
    const existing =
      Platform.OS === 'web' ? localStorage.getItem(key) : await SecureStore.getItemAsync(key);
    if (existing) return existing;
    const token = Array.from(await Crypto.getRandomBytesAsync(32), (b) =>
      b.toString(16).padStart(2, '0')
    ).join('');
    if (Platform.OS === 'web') localStorage.setItem(key, token);
    else await SecureStore.setItemAsync(key, token);
    return token;
  })().catch((error) => {
    tokenPromise = undefined;
    throw error;
  }));
}

export function SampleWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { demoPhone, user, loading: authLoading } = useAuth();
  const identityKey = demoPhone || user?.id || "anonymous";
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dbNotifications, setDbNotifications] = useState<NotificationItem[]>([]);
  const [policies, setPolicies] = useState<Record<string, PolicySection[]>>({});
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [safetyReports, setSafetyReports] = useState<SafetyReport[]>([]);
  const [platformMetrics, setPlatformMetrics] = useState<Record<string, PlatformMetric>>({});
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);
  const pending = useRef<Snapshot | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadAll = useCallback(async () => {
    const token = await workspaceToken(identityKey);
    const [
      ws,
      dirPeople,
      dbAnnounce,
      dbNotifs,
      polAndConf,
      reports,
      txRows,
      callRows,
      msgRows,
      metricsRows,
    ] = await Promise.all([
      rpc('open_demo_workspace', { workspace_token: token }) as Promise<Workspace>,
      fetchDirectoryProfiles(),
      fetchAnnouncements().catch(() => []),
      fetchNotifications().catch(() => []),
      fetchPoliciesAndSettings().catch(() => ({ policies: {}, config: null })),
      fetchSafetyReports().catch(() => []),
      fetchTransactions().catch(() => []),
      fetchCalls().catch(() => []),
      fetchMessages().catch(() => []),
      fetchPlatformMetrics().catch(() => []),
    ]);

    const metricsMap: Record<string, PlatformMetric> = {};
    for (const m of metricsRows) {
      metricsMap[m.metric_key] = m;
    }

    // Merge database records with workspace state if workspace state is empty or initial
    const mergedState: Snapshot = { ...ws.state };

    if (
      !Array.isArray(mergedState.transactions) ||
      mergedState.transactions.length <= 3
    ) {
      if (txRows.length > 0) {
        mergedState.transactions = txRows.map((t) => ({
          id: t.id,
          title: t.title,
          amount: t.amount,
          date: t.date,
          kind: t.kind,
          status: t.status,
        }));
      }
    }

    if (!Array.isArray(mergedState.calls) || mergedState.calls.length <= 3) {
      if (callRows.length > 0) {
        mergedState.calls = callRows.map((c) => ({
          id: c.id,
          person: c.person_id,
          type: c.call_type,
          status: c.status,
          seconds: c.seconds,
          incoming: c.incoming,
        }));
      }
    }

    if (!Array.isArray(mergedState.messages) || mergedState.messages.length <= 3) {
      if (msgRows.length > 0) {
        mergedState.messages = msgRows.map((m) => {
          const time = new Date(m.created_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          });
          return {
            id: m.id,
            user: m.conversation_with,
            mine: m.is_mine,
            text: m.text,
            time,
          };
        });
      }
    }

    if (
      !Array.isArray(mergedState.notifications) ||
      mergedState.notifications.length === 0
    ) {
      if (dbNotifs.length > 0) {
        mergedState.notifications = dbNotifs.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          path: n.path,
          icon: n.icon,
        }));
      }
    }

    if (reports.length > 0 && (!Array.isArray(mergedState.reports) || mergedState.reports.length <= 3)) {
      mergedState.reports = reports.map(
        (r) => `${r.reason} · ${r.reported_user_name}`
      );
    }

    if (metricsMap.total_users?.chart_data && (!Array.isArray(mergedState.chart) || mergedState.chart.length === 0)) {
      mergedState.chart = metricsMap.total_users.chart_data;
    }

    return {
      workspace: { state: mergedState, revision: ws.revision },
      directory: dirPeople,
      announcements: dbAnnounce,
      notifications: dbNotifs,
      policies: polAndConf.policies,
      config: polAndConf.config,
      safetyReports: reports,
      metrics: metricsMap,
    };
  }, [identityKey]);

  useEffect(() => {
    if (authLoading) {
      setWorkspace(null);
      return;
    }
    let active = true;
    setWorkspace(null);
    pending.current = null;
    revision.current = 0;
    setError('');
    loadAll()
      .then((data) => {
        if (!data?.workspace?.state || !Number.isInteger(data.workspace.revision))
          throw new Error('Invalid application data.');
        if (active) {
          revision.current = data.workspace.revision;
          setPeople(data.directory);
          setAnnouncements(data.announcements);
          setDbNotifications(data.notifications);
          setPolicies(data.policies);
          setAppConfig(data.config);
          setSafetyReports(data.safetyReports);
          setPlatformMetrics(data.metrics);
          setWorkspace(data.workspace);
        }
      })
      .catch((err) => {
        console.error('Failed to load platform data:', err);
        if (active) {
          const detail =
            err instanceof Error && err.message
              ? ` ${err.message}`
              : '';
          setError(
            `Unable to load your data. Check your connection and try again.${detail}`,
          );
        }
      });
    return () => {
      active = false;
    };
  }, [attempt, authLoading, demoPhone, loadAll, identityKey, user]);

  const flush = useCallback(async () => {
    if (saving.current || !pending.current) return;
    saving.current = true;
    try {
      const token = await workspaceToken(identityKey);
      while (pending.current) {
        const snapshot: Snapshot = pending.current;
        let nextRevision: number;
        try {
          nextRevision = await rpc('save_demo_workspace', {
            workspace_token: token,
            expected_revision: revision.current,
            next_state: snapshot,
          });
        } catch (saveError) {
          const remote: Workspace = await rpc('open_demo_workspace', { workspace_token: token });
          if (canonical(remote.state) !== canonical(snapshot)) throw saveError;
          nextRevision = remote.revision;
        }
        revision.current = nextRevision;
        if (pending.current === snapshot) pending.current = null;
      }
      if (mounted.current) setError('');
    } catch {
      if (mounted.current) setError('Changes could not be saved. Check your connection and tap Retry.');
    } finally {
      saving.current = false;
    }
  }, [identityKey]);

  const change = useCallback((key: string, update: React.SetStateAction<any>) => {
    setWorkspace((current) => {
      if (!current) return current;
      const value = typeof update === 'function' ? update(current.state[key]) : update;
      const state = { ...current.state, [key]: value };
      pending.current = state;
      return { ...current, state };
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void flush(), 350);
    return () => clearTimeout(timer);
  }, [workspace, flush]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flush();
    });
    return () => sub.remove();
  }, [flush]);

  const retry = () => (workspace ? void flush() : setAttempt((value) => value + 1));

  const refreshPeople = async () => {
    try {
      setPeople(await fetchDirectoryProfiles());
    } catch {
      setError('Unable to refresh people. Pull down to try again.');
    }
  };

  const refreshPlatformData = async () => {
    try {
      const [ann, notifs, pols, reps, mets] = await Promise.all([
        fetchAnnouncements().catch(() => []),
        fetchNotifications().catch(() => []),
        fetchPoliciesAndSettings().catch(() => ({ policies: {}, config: null })),
        fetchSafetyReports().catch(() => []),
        fetchPlatformMetrics().catch(() => []),
      ]);
      setAnnouncements(ann);
      setDbNotifications(notifs);
      setPolicies(pols.policies);
      setAppConfig(pols.config);
      setSafetyReports(reps);
      const metricsMap: Record<string, PlatformMetric> = {};
      for (const m of mets) metricsMap[m.metric_key] = m;
      setPlatformMetrics(metricsMap);
    } catch {
      // Keep existing data on background refresh failure
    }
  };

  if (!workspace)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 16,
        }}
      >
        {error ? (
          <>
            <Text style={{ color: c.text }}>{error}</Text>
            <Pressable onPress={retry}>
              <Text style={{ color: c.mint, padding: 16 }}>Retry</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={c.mint} />
        )}
      </View>
    );

  return (
    <Context.Provider
      value={{
        state: workspace.state,
        people,
        announcements,
        notifications: dbNotifications,
        policies,
        appConfig,
        safetyReports,
        platformMetrics,
        change,
        refreshPeople,
        refreshPlatformData,
      }}
    >
      {children}
      {!!error && (
        <Pressable
          onPress={retry}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: c.errorSurface,
            padding: 14,
          }}
        >
          <Text style={{ color: c.error }}>{error}</Text>
        </Pressable>
      )}
    </Context.Provider>
  );
}

export function useWorkspaceField<T>(
  key: string,
  initial: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const workspace = useContext(Context);
  if (!workspace) throw new Error('Sample workspace required');
  const change = workspace.change;
  const set = useCallback(
    (update: React.SetStateAction<T>) =>
      change(key, (current: T | undefined) =>
        typeof update === 'function' ? (update as (value: T) => T)(current ?? initial) : update
      ),
    [change, key, initial]
  );
  return [(workspace.state[key] ?? initial) as T, set];
}

export function useWorkspacePeople() {
  return useContext(Context)!.people;
}

export function useRefreshPeople() {
  return useContext(Context)!.refreshPeople;
}

export function usePlatformContext() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('PlatformContext requires SampleWorkspaceProvider');
  return ctx;
}
