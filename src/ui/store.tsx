import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { useAuth } from "../data/auth";
import { CallSlab, fetchCallSlabs } from "../data/call-slabs";
import { fetchPhoneUnreadMessageCount, subscribeToAllPhoneMessages } from "../data/chat";
import { DirectoryPerson } from "../data/directory";
import { fetchPhoneHostApplicationStatus } from "../data/host-applications";
import { prepareMessageNotifications, showIncomingMessageNotification } from "../data/local-notifications";
import { fetchDemoProfile, fetchOwnProfile } from "../data/profile";
import {
    usePlatformContext,
    useWorkspaceField,
    useWorkspacePeople,
} from "../data/sample-workspace";
import { supabasePublishableKey, supabaseUrl } from "../data/supabase-config";
import {
    fetchUserPreferences,
    saveUserPreferences,
} from "../data/user-preferences";
import { fetchPhoneWalletBalance } from "../data/wallet";
import { ColorMode, setColorMode } from "./theme";

export const defaultFacets = {
  availability: "All",
  language: "All",
  gender: "All",
  interest: "All",
  minAge: "",
  maxAge: "",
  maxPrice: "",
};
export const COINS_PER_DIAMOND = 10;
export const coins = (amount: number) =>
  `${new Intl.NumberFormat("en-IN").format(Math.abs(amount))} coins`;
export const diamonds = (amount: number) =>
  `${amount} ${amount === 1 ? "diamond" : "diamonds"}`;
export const rupeesForCoins = (amount: number) => amount * 2;
export type Person = DirectoryPerson;
export let people: Person[] = [];

export type Message = {
  id: string;
  user: string;
  text: string;
  mine: boolean;
  time: string;
  failed?: boolean;
  image?: boolean;
};

export type Call = {
  speaker?: boolean;
  id: string;
  person: string;
  type: "audio" | "video";
  status: string;
  seconds: number;
  incoming?: boolean;
  chargedCoins?: number;
  /** Caller-only prepaid talk-time budget, calculated when the call starts. */
  availableSeconds?: number;
  videoUpgradeRequestedBy?: string;
};

export type Transaction = {
  id: string;
  title: string;
  amount: number;
  date: string;
  kind: string;
  status: string;
};

function useDemoState() {
  const { user, demoPhone } = useAuth();
  const platform = usePlatformContext();
  const [ratings, setRatings] = useWorkspaceField<
    { person: string; stars: number; review: string; date: string }[]
  >("ratings", []);
  const [deletionRequest, setDeletionRequest] = useWorkspaceField<{
    reason: string;
    details: string;
    requestedAt: string;
  } | null>("deletionRequest", null);

  people = useWorkspacePeople() as Person[];

  const [notifications, setNotifications] = useWorkspaceField<
    {
      id: string;
      title: string;
      body: string;
      path: string;
      icon: "message-circle" | "video" | "credit-card" | "radio" | "shield";
    }[]
  >(
    "notifications",
    platform.notifications.length > 0 ? platform.notifications : [],
  );

  const [adminEdits, setAdminEdits] = useWorkspaceField<Record<string, string>>(
    "adminEdits",
    {},
  );
  const [audit, setAudit] = useWorkspaceField<string[]>("audit", [
    "Platform initialized with live Supabase configuration · " +
      new Date().toLocaleTimeString(),
  ]);
  const [chart] = useWorkspaceField<number[]>(
    "chart",
    platform.platformMetrics.total_users?.chart_data || [
      65, 100, 85, 135, 115, 155, 143,
    ],
  );
  const [callSlabs, setCallSlabs] = useState<CallSlab[]>([]);
  const [slabsLoading, setSlabsLoading] = useState(true);
  const [slabsError, setSlabsError] = useState(false);
  const [slabRevision, setSlabRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setSlabsLoading(true);
    setSlabsError(false);
    fetchCallSlabs(controller.signal)
      .then((rows) => {
        if (active) setCallSlabs(rows);
      })
      .catch(() => {
        if (active) {
          setCallSlabs([]);
          setSlabsError(true);
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setSlabsLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [slabRevision]);

  const [photo, setPhoto] = useWorkspaceField("photo", "");
  const [hostDraft, setHostDraft] = useWorkspaceField("hostDraft", {
    name: "",
    bio: "",
    languages: [] as string[],
    interests: [] as string[],
    audio: true,
    video: true,
    audioRate: "2",
    videoRate: "5",
    aadhaarDocument: "",
    panDocument: "",
  });
  const [hostStatus, setHostStatus] = useWorkspaceField<
    "none" | "pending" | "approved" | "rejected"
  >("hostStatus", "none");
  const [hostEarnings, setHostEarnings] = useWorkspaceField(
    "hostEarnings",
    850,
  );
  const [withdrawals, setWithdrawals] = useWorkspaceField<
    {
      id: string;
      amount: number;
      method: string;
      status: string;
      date: string;
    }[]
  >("withdrawals", [
    {
      id: "W-1001",
      amount: 300,
      method: "UPI (mahir@upi)",
      status: "Completed",
      date: "15 Sep",
    },
  ]);
  const [favorites, setFavorites] = useWorkspaceField<string[]>("favorites", [
    "priya",
    "kavya",
  ]);
  const [blocked, setBlocked] = useWorkspaceField<string[]>("blocked", []);
  const [available, setAvailable] = useWorkspaceField("available", true);
  const [profile, setProfile] = useWorkspaceField("profile", {
    name: "",
    username: "",
    bio: "",
    languages: ["Hindi", "English"],
    interests: ["Music", "Travel", "Late night talks"],
    dob: "2000-06-15",
    gender: "Female",
    city: "Delhi",
  });

  const refreshUserData = useCallback(async () => {
    if (!user && !demoPhone) return;
    const phoneIdentity = demoPhone || user?.phone || null;
    const profileRequest = user
      ? fetchOwnProfile()
      : demoPhone
        ? fetchDemoProfile(demoPhone)
        : Promise.resolve(null);
    const preferencesRequest = user
      ? fetchUserPreferences()
      : Promise.resolve(null);
    const hostStatusRequest = phoneIdentity
      ? fetchPhoneHostApplicationStatus(phoneIdentity)
      : Promise.resolve(null);
    const [profileResult, preferencesResult, hostStatusResult] =
      await Promise.allSettled([
        profileRequest,
        preferencesRequest,
        hostStatusRequest,
      ]);
    if (!active) return;
    if (profileResult.status === "fulfilled" && profileResult.value) {
      setProfile(profileResult.value);
      if (profileResult.value.photo) setPhoto(profileResult.value.photo);
    }
    if (preferencesResult.status === "fulfilled" && preferencesResult.value) {
      setFavorites(preferencesResult.value.favorites);
      setBlocked(preferencesResult.value.blocked);
      setAvailable(preferencesResult.value.availability === "Available");
    }
    if (hostStatusResult.status === "fulfilled" && hostStatusResult.value)
      setHostStatus(
        hostStatusResult.value === "draft" ? "none" : hostStatusResult.value,
      );
    for (const result of [profileResult, preferencesResult, hostStatusResult]) {
      if (result.status === "rejected")
        console.error(
          "Failed to refresh part of authenticated user data:",
          result.reason,
        );
    }
  }, [
    demoPhone,
    user,
    setAvailable,
    setBlocked,
    setFavorites,
    setHostStatus,
    setProfile,
  ]);

  useEffect(() => {
    if (!user && !demoPhone) return;
    let active = true;
    void refreshUserData().catch((error) => {
      if (active)
        console.error("Failed to load authenticated user data:", error);
    });
    return () => {
      active = false;
    };
  }, [demoPhone, refreshUserData, user]);

  const preferencesLoaded = useRef(false);
  useEffect(() => {
    if (!user) {
      preferencesLoaded.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (!preferencesLoaded.current) {
        preferencesLoaded.current = true;
        return;
      }
      if (!user) return;
      void saveUserPreferences({
        favorites,
        blocked,
        availability: available ? "Available" : "Offline",
      }).catch((error) => {
        console.error("Failed to save authenticated user preferences:", error);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [available, blocked, favorites, user]);
  const [paid, setPaid] = useWorkspaceField("paid", true);
  const [later, setLater] = useWorkspaceField("later", false);
  const [theme, setThemeState] = useWorkspaceField<ColorMode>("theme", "dark");

  useEffect(() => {
    setColorMode(theme);
  }, [theme]);

  const setTheme = (mode: ColorMode) => {
    setColorMode(mode);
    setThemeState(mode);
  };

  const [balance, setBalance] = useWorkspaceField("balance", 1250);
  const [transactions, setTransactions] = useWorkspaceField<Transaction[]>(
    "transactions",
    [],
  );
  const [pack, setPack] = useWorkspaceField("pack", 500);
  const [creditedOrders, setCreditedOrders] = useWorkspaceField<string[]>(
    "creditedOrders",
    [],
  );
  const [messages, setMessages] = useWorkspaceField<Message[]>("messages", []);
  const [calls, setCalls] = useWorkspaceField<Call[]>("calls", []);

  const [active, setActive] = useState<Call | null>(null);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [openChatPhone, setOpenChatPhone] = useState<string | null>(null);
  const openChatPhoneRef = useRef<string | null>(null);

  useEffect(() => {
    openChatPhoneRef.current = openChatPhone;
  }, [openChatPhone]);

  const refreshUnreadMessageCount = useCallback(async () => {
    if (!demoPhone || !/^\+91\d{10}$/.test(demoPhone)) {
      setUnreadMessageCount(0);
      return;
    }
    setUnreadMessageCount(await fetchPhoneUnreadMessageCount(demoPhone));
  }, [demoPhone]);

  useEffect(() => {
    if (!demoPhone) {
      setUnreadMessageCount(0);
      return;
    }
    let activeSubscription = true;
    void prepareMessageNotifications()
      .then(() => undefined)
      .catch((error) => console.warn("Unable to prepare message notifications:", error));
    const refresh = () => {
      void refreshUnreadMessageCount().catch((error) =>
        console.error("Unable to refresh unread message count:", error),
      );
    };
    refresh();
    const unsubscribe = subscribeToAllPhoneMessages(demoPhone, (message) => {
      refresh();
      if (
        activeSubscription &&
        message.recipient_phone === demoPhone &&
        openChatPhoneRef.current !== message.sender_phone
      ) {
        void showIncomingMessageNotification(message.sender_phone, message.text)
          .catch((error) => console.warn("Unable to show message notification:", error));
      }
    });
    return () => {
      activeSubscription = false;
      unsubscribe();
    };
  }, [demoPhone, refreshUnreadMessageCount]);

  const refreshWalletBalance = useCallback(async () => {
    const phone = demoPhone || user?.phone;
    if (!phone) return;
    const serverBalance = await fetchPhoneWalletBalance(phone);
    setBalance(serverBalance);
  }, [demoPhone, setBalance, user?.phone]);

  useEffect(() => {
    let activeRequest = true;
    void refreshWalletBalance().catch((error) => {
      if (activeRequest) console.error("Failed to load wallet balance:", error);
    });
    return () => {
      activeRequest = false;
    };
  }, [refreshWalletBalance]);

  useEffect(() => {
    if (!active || active.status !== "Connected") return;
    const timer = setInterval(
      () => setActive((x) => (x ? { ...x, seconds: x.seconds + 1 } : x)),
      1000,
    );
    return () => clearInterval(timer);
  }, [active?.id, active?.status]);

  const [read, setRead] = useWorkspaceField<string[]>("read", []);
  const [drafts, setDrafts] = useWorkspaceField<Record<string, string>>(
    "drafts",
    {},
  );
  const [prefs, setPrefs] = useWorkspaceField<Record<string, boolean>>(
    "prefs",
    {
      "Show online status": true,
      "Show last seen": true,
      "Allow messages": true,
      "Allow calls": true,
      "Message alerts": true,
      "Call alerts": true,
      "Payment updates": true,
      Announcements: true,
    },
  );
  const [filter, setFilter] = useWorkspaceField("filter", "All");
  const [facets, setFacets] = useWorkspaceField("facets", defaultFacets);
  const [search, setSearch] = useWorkspaceField("search", "");
  const [reports, setReports] = useWorkspaceField<string[]>(
    "reports",
    platform.safetyReports.map((r) => `${r.reason} · ${r.reported_user_name}`),
  );

  const toggleFavorite = (id: string) =>
    setFavorites((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
    );

  const finishCall = (status = "Ended", chargedCoins?: number) => {
    if (!active) return;
    const ended = { ...active, status, chargedCoins };
    setCalls((v) => [ended, ...v.filter((x) => x.id !== ended.id)]);
    setActive(null);
  };

  // Submit report to Supabase DB
  const submitSafetyReport = async (
    reportedUserId: string,
    reportedUserName: string,
    reason: string,
    details: string,
  ) => {
    const payload = {
      reporter_name: profile.name || "Anonymous User",
      reported_user_id: reportedUserId,
      reported_user_name: reportedUserName,
      reason,
      details,
      status: "Open",
    };
    try {
      await fetch(`${supabaseUrl}/rest/v1/safety_reports`, {
        method: "POST",
        headers: {
          apikey: supabasePublishableKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("Failed to post report to DB:", e);
    }
    setReports((v) => [`${reason} · ${reportedUserName}`, ...v]);
    void platform.refreshPlatformData();
  };

  // Submit announcement to Supabase DB
  const submitAnnouncement = async (
    title: string,
    message: string,
    audience = "All users",
    tag = "Update",
  ) => {
    try {
      await fetch(`${supabaseUrl}/rest/v1/announcements`, {
        method: "POST",
        headers: {
          apikey: supabasePublishableKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          title,
          message,
          audience,
          tag,
          is_active: true,
        }),
      });
      void platform.refreshPlatformData();
    } catch (e) {
      console.error("Failed to post announcement to DB:", e);
    }
  };

  // Resolve safety report in Supabase DB
  const resolveSafetyReport = async (
    reportId: string,
    status: "Open" | "Under review" | "Resolved" | "Rejected",
    note?: string,
  ) => {
    try {
      await fetch(`${supabaseUrl}/rest/v1/safety_reports?id=eq.${reportId}`, {
        method: "PATCH",
        headers: {
          apikey: supabasePublishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status, resolution_note: note ?? null }),
      });
      void platform.refreshPlatformData();
    } catch (e) {
      console.error("Failed to update report in DB:", e);
    }
  };

  return {
    ratings,
    setRatings,
    deletionRequest,
    setDeletionRequest,
    people,
    notifications,
    setNotifications,
    adminEdits,
    setAdminEdits,
    audit,
    setAudit,
    chart,
    callSlabs,
    slabsLoading,
    slabsError,
    refreshSlabs: () => setSlabRevision((value) => value + 1),
    photo,
    setPhoto,
    hostDraft,
    setHostDraft,
    hostStatus,
    setHostStatus,
    hostEarnings,
    setHostEarnings,
    withdrawals,
    setWithdrawals,
    favorites,
    toggleFavorite,
    blocked,
    setBlocked,
    profile,
    setProfile,
    available,
    setAvailable,
    paid,
    setPaid,
    later,
    setLater,
    theme,
    setTheme,
    balance,
    setBalance,
    refreshWalletBalance,
    transactions,
    setTransactions,
    pack,
    setPack,
    creditedOrders,
    setCreditedOrders,
    messages,
    setMessages,
    calls,
    setCalls,
    active,
    setActive,
    unreadMessageCount,
    refreshUnreadMessageCount,
    setOpenChatPhone,
    finishCall,
    read,
    setRead,
    drafts,
    setDrafts,
    prefs,
    setPrefs,
    filter,
    facets,
    setFacets,
    setFilter,
    search,
    setSearch,
    reports,
    setReports,
    // Live Supabase dynamic data & functions
    announcements: platform.announcements,
    policies: platform.policies,
    appConfig: platform.appConfig,
    safetyReports: platform.safetyReports,
    platformMetrics: platform.platformMetrics,
    refreshPlatformData: platform.refreshPlatformData,
    refreshUserData,
    submitSafetyReport,
    submitAnnouncement,
    resolveSafetyReport,
  };
}

const Context = createContext<ReturnType<typeof useDemoState> | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const state = useDemoState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useDemo() {
  const value = useContext(Context);
  if (!value) throw new Error("DemoProvider required");
  return value;
}

export function personFor(id?: string) {
  return people.find((p) => p.id === id) || people[0];
}

export const money = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
export const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
/** Remaining talk time for active calls, displayed as hours:minutes:seconds. */
export const talkTime = (seconds: number) => {
  const remaining = Math.max(0, Math.floor(seconds));
  const wholeMinutes = Math.floor(remaining / 60);
  return `${Math.floor(wholeMinutes / 60)
    .toString()
    .padStart(2, "0")}:${(wholeMinutes % 60)
    .toString()
    .padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`;
};
