import { useAuth } from "@/data/auth";
import { fetchPhoneConversations, fetchPhoneMessages, markPhoneConversationRead, sendPhoneMessage, subscribeToAllPhoneMessages, subscribeToPhoneMessages, type PhoneMessage } from "@/data/chat";
import { sendPushEvent } from "@/data/push-notifications";
import { fetchPhoneHostDashboard, type HostDashboard } from "@/data/host-dashboard";
import { fetchHostEarningSlabs, type HostEarningSlab } from "@/data/host-metrics";
import { router, useFocusEffect } from "expo-router";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, TextInput, useWindowDimensions, View } from "react-native";
import { useRefreshPeople } from '../data/sample-workspace';
import {
    Avatar,
    Badge,
    Button,
    Card,
    Chip,
    Chips,
    Empty,
    Field,
    go,
    Icon,
    IconButton,
    LoadingCards,
    Notice,
    presenceText,
    Row,
    s,
    Section,
    Shell,
    T,
    UserCard,
} from "./components";
import { defaultFacets, people, personFor, useDemo } from "./store";
import { colors as c } from "./theme";
import { useLanguage } from "./language";

const formatCallTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};
const formatRupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function chatDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatChatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  if (date.getTime() >= startToday) return "Today";
  if (date.getTime() >= startYesterday) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function formatChatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return `${formatChatDate(value)}, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function HostDashboardHome() {
  const auth = useAuth();
  const d = useDemo();
  const { translate } = useLanguage();
  const [dashboard, setDashboard] = useState<HostDashboard | null>(null);
  const [earningSlabs, setEarningSlabs] = useState<HostEarningSlab[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const loadDashboard = useCallback(() => {
    if (!auth.demoPhone) return Promise.resolve(null);
    return fetchPhoneHostDashboard(auth.demoPhone);
  }, [auth.demoPhone]);
  useFocusEffect(
    useCallback(() => {
      let focused = true;
      let loading = false;
      const refreshDashboard = async () => {
        if (loading || !auth.demoPhone) return;
        loading = true;
        try {
          const data = await loadDashboard();
          if (focused && data) {
            setDashboard(data);
            setError("");
          }
        } catch (cause) {
          if (focused)
            setError(cause instanceof Error ? cause.message : "Unable to load your host dashboard.");
        } finally {
          loading = false;
        }
      };
      void refreshDashboard();
      const interval = setInterval(() => void refreshDashboard(), 10000);
      return () => {
        focused = false;
        clearInterval(interval);
      };
    }, [auth.demoPhone, loadDashboard]),
  );
  useEffect(() => {
    if (!auth.demoPhone) {
      setEarningSlabs([]);
      return;
    }
    let active = true;
    void fetchHostEarningSlabs()
      .then((data) => { if (active) setEarningSlabs(data); })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load host earning rates.");
      });
    return () => { active = false; };
  }, [auth.demoPhone]);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const [dashboardData, slabData] = await Promise.all([
        loadDashboard(),
        fetchHostEarningSlabs(),
      ]);
      if (dashboardData) setDashboard(dashboardData);
      setEarningSlabs(slabData);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to refresh your dashboard."); }
    finally { setRefreshing(false); }
  };
  return (
    <Shell tab="Explore" refreshing={refreshing} onRefresh={refresh}>
      <Card style={{ borderLeftWidth: 3, borderLeftColor: c.mint }}>
        <T mono size={11} color={c.mint}>HOST DASHBOARD</T>
        <T size={24} bold>{d.profile.name ? `${translate("Hi")}, ${d.profile.name}` : "Welcome back"}</T>
        <T color={c.secondary}>
          {dashboard?.active_calls ? `${dashboard.active_calls} call${dashboard.active_calls === 1 ? "" : "s"} live now` : "Your call activity and earnings, live from your account."}
        </T>
      </Card>
      {error ? <Notice error>{error}</Notice> : null}
      <Section title="Today" />
      <Row>
        <Card style={{ flex: 1, minHeight: 106 }}>
          <Icon name="phone-call" color={c.mint} />
          <T mono size={10} color={c.secondary}>CONNECTED CALLS</T>
          <T size={25} bold>{dashboard ? dashboard.today_calls : "—"}</T>
          <T size={11} color={c.muted}>{dashboard ? formatCallTime(dashboard.today_seconds) : "Loading…"}</T>
        </Card>
        <Card style={{ flex: 1, minHeight: 106 }}>
          <Icon name="trending-up" color={c.mint} />
          <T mono size={10} color={c.secondary}>EARNED TODAY</T>
          <T size={25} bold>{dashboard ? formatRupees(dashboard.today_earnings_paise) : "—"}</T>
          <T size={11} color={c.muted}>From completed call billing</T>
        </Card>
      </Row>
      <Section title="All time" />
      <Row>
        <Card style={{ flex: 1 }}>
          <T mono size={10} color={c.secondary}>TOTAL CALLS</T>
          <T size={23} bold>{dashboard ? dashboard.total_calls : "—"}</T>
        </Card>
        <Card style={{ flex: 1 }}>
          <T mono size={10} color={c.secondary}>TOTAL EARNINGS</T>
          <T size={23} bold>{dashboard ? formatRupees(dashboard.total_earnings_paise) : "—"}</T>
        </Card>
      </Row>
      <Section title="Host earning rates" />
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <T mono size={10} color={c.secondary}>DAILY TALK TIME</T>
          <T mono size={10} color={c.secondary}>AUDIO / VIDEO</T>
        </Row>
        {earningSlabs.map((slab) => (
          <Row key={slab.min_minutes} style={{ justifyContent: "space-between" }}>
            <T>{slab.max_minutes === null ? `Above ${slab.min_minutes} min` : `${slab.min_minutes}–${slab.max_minutes} min`}</T>
            <T bold color={c.mint}>₹{slab.audio_paise_per_minute / 100} / ₹{slab.video_paise_per_minute / 100} per min</T>
          </Row>
        ))}
      </Card>
      <Row>
        <Card style={{ flex: 1 }}>
          <T mono size={10} color={c.secondary}>MISSED / DECLINED</T>
          <T size={20} bold>{dashboard ? dashboard.missed_calls : "—"}</T>
        </Card>
        <Button title="Host tools" variant="secondary" icon="settings" style={{ flex: 1 }} onPress={() => go("/host/status")} />
      </Row>
      <Section title="Recent activity" action="View calls" onPress={() => go("/calls")} />
      {dashboard?.recent_calls.map((call) => {
        const contactName = call.caller_username ? `@${call.caller_username}` : "Caller";
        const label = call.status === "ended" ? `${call.call_type === "video" ? "Video" : "Audio"} call completed` : call.status === "missed" ? `Missed ${call.call_type} call` : "Call declined";
        return (
          <Pressable key={call.id} onPress={() => go(`/calls/detail/${call.id}`)} style={{ backgroundColor: c.low, padding: 16, borderRadius: 18 }}>
            <Row>
              <Icon name={call.call_type === "video" ? "video" : "phone"} color={c.mint} />
              <View style={{ flex: 1, gap: 2 }}>
                <T bold>{label}</T>
                <T size={12} color={c.secondary}>{contactName} · {new Date(call.created_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</T>
              </View>
              {call.status === "ended" && <T mono size={11} color={c.muted}>{formatCallTime(call.duration_seconds)}</T>}
            </Row>
          </Pressable>
        );
      })}
      {dashboard && !dashboard.recent_calls.length && <Empty icon="phone" title="No calls yet" message="Your completed and missed call activity will appear here." />}
      <Button title="Earnings & withdrawals" variant="secondary" icon="credit-card" onPress={() => go("/host/withdraw")} />
    </Shell>
  );
}

function HostDirectoryUnavailable({ title = "Host dashboard" }: { title?: string }) {
  return (
    <Shell title={title}>
      <Card style={{ gap: 12 }}>
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.high,
          }}
        >
          <Icon name="phone-call" color={c.mint} size={22} />
        </View>
        <T size={20} bold>Hosts receive calls</T>
        <T color={c.secondary}>
          Your Host account is set up to receive calls from members. Searching
          the Host directory and starting outgoing calls are not available for
          Hosts.
        </T>
        <Button title="Go to Host dashboard" onPress={() => go("/explore")} />
      </Card>
    </Shell>
  );
}

function HostJourneyHome() {
  const d = useDemo();
  const pending = d.hostStatus === "pending";
  return (
    <Shell tab="Explore">
      <Card style={{ backgroundColor: "#3b2740", borderWidth: 1, borderColor: "#69476d", gap: 14 }}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ backgroundColor: "#f6d6b2", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
            <T mono size={10} bold color="#492c31">HOST DASHBOARD</T>
          </View>
          <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#56385d", borderWidth: 1, borderColor: "#795b80" }}>
            <Icon name={pending ? "clock" : "star"} color="#ffd49a" size={21} />
          </View>
        </Row>
        <View style={{ gap: 5 }}>
          <T bold size={22} color="#ffffff">{pending ? "Your Host application is under review" : "Start your Host journey"}</T>
          <T size={13} color="#f2dff2">
            {pending
              ? "We are checking your details. We’ll notify you as soon as your Host account is ready."
              : "Complete your verification to receive calls and earn through audio and video conversations."}
          </T>
        </View>
        <Row style={{ flexWrap: "wrap", gap: 7 }}>
          {(pending ? ["Application submitted", "Review in progress"] : ["Profile verification", "Secure payouts", "Flexible hours"]).map((item) => (
            <View key={item} style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "#56385d" }}><T mono size={10} color="#ffffff">{item}</T></View>
          ))}
        </Row>
        <Button title={pending ? "View application status" : "Complete Host application"} icon={pending ? "clock" : "arrow-right"} onPress={() => go(pending ? "/host/status" : "/host/apply")} />
      </Card>
      <Card>
        <T size={18} bold>{pending ? "What happens next" : "Become ready to receive calls"}</T>
        <T color={c.secondary}>
          {pending
            ? "Our team will verify your profile and payout details. Once approved, your dashboard, earnings, and Host call tools will unlock here."
            : "Add the required Host details, a profile photo, verification documents, and a payout method. You can check your progress any time."}
        </T>
      </Card>
      <Button title="Need help? Contact support" variant="secondary" icon="help-circle" onPress={() => go("/settings/help")} />
    </Shell>
  );
}

export function Discovery({ mode = "explore" }: { mode?: string }) {
  const d = useDemo();
  const refreshPeople = useRefreshPeople();
  const isHostAccount = d.profile.gender === "Female";
  const isHost = isHostAccount && d.hostStatus === "approved";
  const wideLayout = useWindowDimensions().width >= 768;
  const [refreshing, setRefreshing] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [newlyAvailableCount, setNewlyAvailableCount] = useState(0);
  const knownAvailableRef = useRef<Set<string> | null>(null);
  const availabilityNoticeY = useRef(new Animated.Value(-72)).current;
  const searching = mode === "search";
  const favorites = mode === "favorites";
  useEffect(() => {
    if ((mode !== "search" && mode !== "explore" && mode !== "favorites") || isHostAccount)
      return;
    let mounted = true;
    let loading = false;
    const refreshDirectoryPresence = async () => {
      if (!mounted || loading) return;
      loading = true;
      try {
        // This updates every visible status (available, busy, and offline),
        // not just new people. It keeps separate browser sessions in sync.
        const directory = await refreshPeople();
        if (!mounted) return;
        const availableNow = new Set(
          directory
            .filter((person) => person.status === "Available")
            .map((person) => person.id),
        );
        const known = knownAvailableRef.current;
        knownAvailableRef.current = availableNow;
        if (!known) return;
        const additions = [...availableNow].filter((id) => !known.has(id));
        if (!additions.length) return;
        setNewlyAvailableCount(additions.length);
        Animated.timing(availabilityNoticeY, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }).start();
      } catch (error) {
        console.warn("Unable to refresh people presence:", error);
      } finally {
        loading = false;
        if (mounted) setDirectoryLoading(false);
      }
    };
    void refreshDirectoryPresence();
    const interval = setInterval(() => void refreshDirectoryPresence(), 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [availabilityNoticeY, isHostAccount, mode, refreshPeople]);
  const refreshPeopleList = useCallback(async () => {
    setRefreshing(true);
    try {
      d.refreshSlabs();
      const directory = await refreshPeople();
      knownAvailableRef.current = new Set(
        directory
          .filter((person) => person.status === "Available")
          .map((person) => person.id),
      );
      setNewlyAvailableCount(0);
      Animated.timing(availabilityNoticeY, {
        toValue: -72,
        duration: 180,
        useNativeDriver: true,
      }).start();
    } finally {
      setRefreshing(false);
    }
  }, [availabilityNoticeY, d, refreshPeople]);
  if (isHost && mode === "explore") return <HostDashboardHome />;
  if (isHostAccount && mode === "explore") return <HostJourneyHome />;
  if (isHostAccount) return <HostDirectoryUnavailable title={searching ? "Search people" : favorites ? "Favorites" : "Host dashboard"} />;
  const result = d.people.filter(
    (p) =>
      !d.blocked.includes(p.id) &&
      (!favorites || d.favorites.includes(p.id)) &&
      (d.facets.availability === "All" || p.status === d.facets.availability) &&
      (d.facets.language === "All" ||
        p.languages.includes(d.facets.language)) &&
      (d.facets.gender === "All" || p.gender === d.facets.gender) &&
      (d.facets.interest === "All" ||
        p.interests.some((x) =>
          x.toLowerCase().includes(d.facets.interest.toLowerCase()),
        )) &&
      (!d.facets.minAge || p.age >= Number(d.facets.minAge)) &&
      (!d.facets.maxAge || p.age <= Number(d.facets.maxAge)) &&
      (!d.paid || !d.facets.maxPrice || Number(d.facets.maxPrice) >= 5) &&
      (d.filter === "All" ||
        p.status === d.filter ||
        p.languages.includes(d.filter) ||
        p.interests.some((x) =>
          x.toLowerCase().includes(d.filter.toLowerCase()),
        )) &&
      (!searching ||
        `${p.name} ${p.bio} ${p.city}`
          .toLowerCase()
          .includes(d.search.toLowerCase())),
  );
  return (
    <Shell
      title={searching ? "Search people" : favorites ? "Favorites" : undefined}
      tab={mode === "explore" ? "Explore" : undefined}
      refreshing={refreshing}
      onRefresh={
        mode === "explore"
          ? refreshPeopleList
          : undefined
      }
    >
      <>
      {newlyAvailableCount > 0 && (
        <Animated.View
          style={{
            transform: [{ translateY: availabilityNoticeY }],
            opacity: availabilityNoticeY.interpolate({
              inputRange: [-72, 0],
              outputRange: [0, 1],
            }),
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh to see newly available people"
            onPress={refreshPeopleList}
            style={{
              backgroundColor: c.low,
              borderColor: c.line,
              borderWidth: 1.5,
              borderRadius: 20,
              padding: 12,
              boxShadow: "0 10px 22px rgba(120,50,30,0.10)",
            }}
          >
            <Row style={{ justifyContent: "space-between" }}>
              <Row style={{ flex: 1 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: c.high,
                  }}
                >
                  <Icon name="heart" color={c.mint} size={18} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <T bold size={14}>
                    Fresh faces are ready to chat
                  </T>
                  <T size={12} color={c.secondary}>Tap to see who’s online</T>
                </View>
              </Row>
              <View
                style={{
                  backgroundColor: c.mint,
                  borderRadius: 14,
                  paddingHorizontal: 11,
                  paddingVertical: 8,
                }}
              >
                <T bold size={12} color="#ffffff">
                  Show
                </T>
              </View>
            </Row>
          </Pressable>
        </Animated.View>
      )}
      {searching && (
        <>
          <Field
            label="Search"
            placeholder="Name, city, or something in common"
            value={d.search}
            onChange={d.setSearch}
          />
          <Button
            title="More filters"
            variant="secondary"
            icon="sliders"
            onPress={() => go("/filters")}
          />
        </>
      )}
      <Section
        title={
          favorites
            ? "Your favorite people"
            : searching
              ? `${result.length} people found`
              : "People to meet"
        }
        action={favorites ? undefined : "Open filters"}
        actionIcon={favorites ? undefined : "sliders"}
        onPress={() => go("/filters")}
      />
      {mode === "explore" && <Chips compact items={["All", "Available", "Hindi", "Tamil", "English"]} selected={d.filter} onChange={d.setFilter} />}
      {directoryLoading ? <LoadingCards count={mode === "explore" ? 4 : 3} /> : mode === "explore" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: result.length === 1 ? "center" : "flex-start", gap: 14 }}>
          {result.map((p, index) => (
            <View key={p.id} style={{ width: wideLayout ? "48%" : "100%", maxWidth: wideLayout ? 520 : undefined }}>
              <UserCard person={p} grid index={index} />
            </View>
          ))}
        </View>
      ) : wideLayout ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: 12 }}>
          {result.map((p) => (
            <View key={p.id} style={{ width: "48%", flexGrow: 1, minWidth: 0 }}>
              <UserCard person={p} />
            </View>
          ))}
        </View>
      ) : result.map((p) => <UserCard key={p.id} person={p} />)}
      {!directoryLoading && !result.length && (
        <Empty
          title={favorites ? "Keep good company close" : "No people found"}
          message={
            favorites
              ? "Tap a heart on someone’s profile to find them here."
              : "Try another search or clear your filters."
          }
          action="Clear filters"
          onPress={() => {
            d.setFilter("All");
            d.setSearch("");
            d.setFacets(defaultFacets);
          }}
          icon="users"
        />
      )}
      </>
    </Shell>
  );
}
type FilterOption = { label: string; value: string };

function FilterGroup({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: FilterOption[];
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <Card style={{ gap: 12 }}>
      <T size={16} bold>{title}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => (
          <Chip
            key={option.value}
            title={option.label}
            selected={selected === option.value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </Card>
  );
}

export function Filters() {
  const d = useDemo();
  if (d.profile.gender === "Female") return <HostDirectoryUnavailable title="Filters" />;
  return <FiltersContent />;
}

function FiltersContent() {
  const d = useDemo();
  const [draft, setDraft] = useState(d.facets);
  const [error, setError] = useState("");
  const choose = (key: keyof typeof draft, value: string) =>
    setDraft((x) => ({ ...x, [key]: value }));
  return (
    <Shell title="Filters">
      <View style={{ gap: 6 }}>
        <T size={24} bold>Find your people</T>
        <T color={c.secondary}>Choose what matters to you, then view matching people.</T>
      </View>
      <FilterGroup
        title="Availability"
        options={[
          { label: "All", value: "All" },
          { label: "Online", value: "Available" },
          { label: "Busy", value: "Busy" },
          { label: "Offline", value: "Offline" },
        ]}
        selected={draft.availability}
        onChange={(v) => choose("availability", v)}
      />
      <FilterGroup
        title="Language"
        options={["All", "Hindi", "English", "Kannada", "Tamil"].map((value) => ({ label: value, value }))}
        selected={draft.language}
        onChange={(v) => choose("language", v)}
      />
      <FilterGroup
        title="Looking for"
        options={[
          { label: "Everyone", value: "All" },
          { label: "Women", value: "Female" },
          { label: "Men", value: "Male" },
        ]}
        selected={draft.gender}
        onChange={(v) => choose("gender", v)}
      />
      <Card style={{ gap: 12 }}>
        <T size={16} bold>Age range</T>
        <Row style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Field
              label="Minimum age"
              numeric
              value={draft.minAge}
              onChange={(v) => choose("minAge", v)}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Field
              label="Maximum age"
              numeric
              value={draft.maxAge}
              onChange={(v) => choose("maxAge", v)}
            />
          </View>
        </Row>
      </Card>
      <FilterGroup
        title="Interests"
        options={["All", "Music", "Poetry", "Travel", "Books", "Coffee"].map((value) => ({ label: value, value }))}
        selected={draft.interest}
        onChange={(v) => choose("interest", v)}
      />
      {d.paid && (
        <Card>
          <Field
            label="Maximum audio price per minute (₹)"
            numeric
            value={draft.maxPrice}
            onChange={(v) => choose("maxPrice", v)}
          />
        </Card>
      )}
      {error && <Notice error>{error}</Notice>}
      <View style={{ gap: 10, paddingTop: 2 }}>
        <Button
          title="Show results"
          onPress={() => {
            if (
              (draft.minAge &&
                (!Number.isFinite(Number(draft.minAge)) ||
                  Number(draft.minAge) < 0)) ||
              (draft.maxAge && Number(draft.maxAge) < Number(draft.minAge || 0))
            )
              return setError(
                "Enter a valid age range, with maximum age at least the minimum.",
              );
            d.setFacets(draft);
            d.setFilter("All");
            router.replace("/search" as never);
          }}
        />
        <Button
          title="Reset filters"
          variant="secondary"
          onPress={() => {
            setDraft(defaultFacets);
            setError("");
          }}
        />
      </View>
    </Shell>
  );
}
export function UserProfile({ id }: { id: string }) {
  const d = useDemo();
  if (d.profile.gender === "Female") return <HostDirectoryUnavailable title="Host dashboard" />;
  const p = personFor(id);
  const blocked = d.blocked.includes(id);
  const isApprovedHost = d.hostStatus === "approved";
  return (
    <Shell title="Meet someone new">
      <View style={{ alignItems: "center", gap: 16, paddingVertical: 15 }}>
        <Avatar person={p} size={112} />
        <T size={24} bold>
          {p.name}, {p.age}
        </T>
        <Badge
          text={blocked ? "Blocked" : p.status}
          warning={blocked || p.status !== "Available"}
        />
        <T color={c.secondary}>
          {p.city} · {p.languages.join(" · ")}
        </T>
      </View>
      <Card>
        <T size={18} bold>
          A little about me
        </T>
        <T color={c.secondary}>{p.bio}</T>
        <Row style={{ flexWrap: "wrap" }}>
          {p.interests.map((x) => (
            <Chip key={x} title={x} />
          ))}
        </Row>
      </Card>
      {!blocked && (
        <>
          {!isApprovedHost && p.status === "Available" && <Row>
            <Button
              title="Audio call"
              icon="phone"
              style={{ flex: 1 }}
              onPress={() => go(`/calls/outgoing/${id}?type=audio`)}
            />
            <Button
              title="Video"
              icon="video"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => go(`/calls/outgoing/${id}?type=video`)}
            />
          </Row>}
          {!isApprovedHost && p.status !== "Available" && (
            <Notice>
              {p.status === "Busy" ? "This Host is busy on another call." : "This Host is offline."}
            </Notice>
          )}
          {d.paid && !isApprovedHost && (
            <T mono size={11} color={c.muted}>
              Audio {d.callSlabs.find(row => row.call_type === 'AUDIO')?.diamonds_per_minute ?? '—'} diamonds/min · Video {d.callSlabs.find(row => row.call_type === 'VIDEO')?.diamonds_per_minute ?? '—'} diamonds/min
            </T>
          )}
          <Button
            title="Start a conversation"
            icon="message-circle"
            variant="secondary"
            onPress={() => go(`/chat/${id}`)}
          />
          <Button
            title={
              d.favorites.includes(id)
                ? "Remove from favorites"
                : "Add to favorites"
            }
            icon="heart"
            variant="secondary"
            onPress={() => d.toggleFavorite(id)}
          />
        </>
      )}
      <Row>
        <Button
          title="Report"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => go(`/report/${id}`)}
        />
        <Button
          title={blocked ? "Unblock" : "Block"}
          variant="danger"
          style={{ flex: 1 }}
          onPress={() => go(`/block/${id}`)}
        />
      </Row>
    </Shell>
  );
}
export function Conversations() {
  const auth = useAuth();
  const d = useDemo();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<{ otherPhone: string; text: string; time: string; username?: string | null; displayName?: string | null; avatarUrl?: string | null; isHost?: boolean }[]>([]);
  const loadConversations = async () => {
    if (!auth.demoPhone) {
      setLoading(false);
      return;
    }
    try {
      const rows = await fetchPhoneConversations(auth.demoPhone);
      setConversations(rows.map((row) => ({
        otherPhone: row.other_phone,
        text: row.last_text,
        time: formatChatTimestamp(row.last_created_at),
        username: row.other_username,
        displayName: row.other_display_name,
        avatarUrl: row.other_avatar_url,
        isHost: row.other_is_host,
      })));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!auth.demoPhone) return;
    void loadConversations().catch((error) => console.error("Failed to load conversations:", error));
    const refresh = setInterval(() => { void loadConversations().catch(console.error); }, 5000);
    const unsubscribe = subscribeToAllPhoneMessages(auth.demoPhone, () => { void loadConversations().catch(console.error); });
    return () => { clearInterval(refresh); unsubscribe(); };
  }, [auth.demoPhone]);
  const list = conversations
    .map((conversation) => ({
      conversation,
      person: people.find((item) => item.id === `phone_${conversation.otherPhone.replace("+", "")}`) ?? {
        id: `phone_${conversation.otherPhone.replace("+", "")}`,
        name: d.hostStatus === "approved"
          ? conversation.username ? `@${conversation.username}` : "Caller"
          : conversation.isHost
            ? conversation.displayName || "Host"
            : conversation.username ? `@${conversation.username}` : "Conversation",
        age: 0,
        gender: "",
        city: "",
        languages: [],
        interests: [],
        bio: "",
        status: "Available" as const,
        color: c.mint,
        ...(d.hostStatus === "approved" ? {} : conversation.avatarUrl ? { photo: conversation.avatarUrl } : {}),
      },
    }))
    .filter((item) => item.person.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <Shell tab="Messages">
      <Section title="Messages" />
      <Field
        label="Search conversations"
        placeholder="Find a conversation"
        value={query}
        onChange={setQuery}
      />
      {loading ? <LoadingCards count={3} /> : list.map(({ person, conversation }) => {
        if (!person) return null;
        return (
          <Pressable
            key={conversation.otherPhone}
            onPress={() => {
              go(`/chat/phone_${conversation.otherPhone.replace("+", "")}`);
            }}
            style={{ backgroundColor: c.low, padding: 18, borderRadius: 24 }}
          >
            <Row>
              <Avatar person={person} />
              <View style={{ flex: 1, gap: 5 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <T bold>{person.name}</T>
                  <T mono size={9} color={c.muted}>
                    {conversation.time}
                  </T>
                </Row>
                <T size={13} color={c.secondary} numberOfLines={1}>
                  {conversation.text}
                </T>
              </View>
            </Row>
          </Pressable>
        );
      })}
      {!loading && !list.length && (
        <Empty
          title="Start with a hello"
          message="Your conversations will appear here."
          action="Explore people"
          onPress={() => go("/explore")}
        />
      )}
    </Shell>
  );
}
export function Chat({ id }: { id: string }) {
  const { translate } = useLanguage();
  const d = useDemo();
  const { refreshUnreadMessageCount, refreshUnreadNotificationCount, setOpenChatPhone } = d;
  const auth = useAuth();
  const p = personFor(id);
  const isApprovedHost = d.hostStatus === "approved";
  const [hostCallerUsername, setHostCallerUsername] = useState("");
  const chatPerson = isApprovedHost
    ? {
        ...p,
        name: hostCallerUsername ? `@${hostCallerUsername}` : "Caller",
        photo: undefined,
      }
    : p;
  const [liveMessages, setLiveMessages] = useState<PhoneMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [chatError, setChatError] = useState("");
  const blocked = d.blocked.includes(id);
  const text = d.drafts[id] || "";
  const otherPhone = id.startsWith("phone_") ? `+${id.slice("phone_".length)}` : "";
  useEffect(() => {
    if (!isApprovedHost || !auth.demoPhone || !otherPhone) {
      setHostCallerUsername("");
      return;
    }
    let active = true;
    void fetchPhoneConversations(auth.demoPhone)
      .then((rows) => {
        if (active)
          setHostCallerUsername(
            rows.find((row) => row.other_phone === otherPhone)?.other_username || "",
          );
      })
      .catch((error) => console.warn("Unable to load caller username:", error));
    return () => { active = false; };
  }, [auth.demoPhone, isApprovedHost, otherPhone]);
  useEffect(() => {
    if (!auth.demoPhone || !otherPhone) {
      setMessagesLoading(false);
      return;
    }
    let active = true;
    setOpenChatPhone(otherPhone);
    const loadMessages = () => fetchPhoneMessages(auth.demoPhone!, otherPhone)
      .then((messages) => {
        if (active) setLiveMessages(messages);
        return markPhoneConversationRead(auth.demoPhone!, otherPhone);
      })
      .then(() => {
        if (active) {
          void refreshUnreadMessageCount();
          void refreshUnreadNotificationCount();
        }
      })
      .catch((error) => { if (active) setChatError(error instanceof Error ? error.message : "Unable to load messages."); })
      .finally(() => { if (active) setMessagesLoading(false); });
    void loadMessages();
    const refreshTimer = setInterval(() => { void loadMessages(); }, 5000);
    const unsubscribe = subscribeToPhoneMessages(auth.demoPhone, otherPhone, (message) => {
      setLiveMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      if (message.recipient_phone === auth.demoPhone) {
        void markPhoneConversationRead(auth.demoPhone!, otherPhone)
          .then(() => {
            void refreshUnreadMessageCount();
            void refreshUnreadNotificationCount();
          })
          .catch((error) => console.warn("Unable to mark incoming message as read:", error));
      }
    });
    return () => { active = false; setOpenChatPhone(null); clearInterval(refreshTimer); unsubscribe(); };
  }, [auth.demoPhone, otherPhone, refreshUnreadMessageCount, refreshUnreadNotificationCount, setOpenChatPhone]);
  const send = () => {
    if (!text.trim() || blocked) return;
    if (text.trim().length > 500) {
      setChatError("Messages can be up to 500 characters.");
      return;
    }
    if (!auth.demoPhone || !otherPhone) {
      setChatError("This conversation is not connected to a phone account.");
      return;
    }
    const body = text.trim();
    d.setDrafts((v) => ({ ...v, [id]: "" }));
    void sendPhoneMessage(auth.demoPhone, otherPhone, body)
      .then(({ message, remainingCoins, coinsCharged }) => {
        d.setBalance(remainingCoins);
        setLiveMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
        void auth.getIdentityToken()
          .then((idToken) => sendPushEvent(idToken, "message", message.id))
          .catch((error) => console.warn("Unable to send message push:", error));
        if (coinsCharged > 0) {
          void auth.getIdentityToken()
            .then((idToken) => sendPushEvent(idToken, "wallet", message.id, "message"))
            .catch((error) => console.warn("Unable to send message wallet push:", error));
        }
      })
      .catch((error) => {
        d.setDrafts((v) => ({ ...v, [id]: body }));
        setChatError(error instanceof Error ? error.message : "Message could not be sent.");
      });
  };
  return (
    <Shell
      title="Conversation"
      scrollToEndToken={liveMessages.at(-1)?.id}
      stickyContentHeader={
        <Row>
          <Avatar person={chatPerson} size={44} />
          <View style={{ flex: 1 }}>
            {isApprovedHost ? (
              <T bold size={17}>
                {hostCallerUsername ? `@${hostCallerUsername}` : "Caller"}
              </T>
            ) : (
              <Pressable onPress={() => go(`/user/${id}`)}>
                <T bold size={17}>{p.name}</T>
              </Pressable>
            )}
            <T mono size={10} color={c.mint}>
              {blocked ? "BLOCKED" : presenceText(p.status).toUpperCase()}
            </T>
          </View>
          {!blocked && <IconButton
            icon="shield"
            label="Safety options"
            onPress={() => go(`/report/${id}`)}
          />}
          {!isApprovedHost && !blocked && <IconButton
            icon="phone"
            label="Audio call"
            onPress={() => go(`/calls/outgoing/${id}?type=audio`)}
          />}
          {!isApprovedHost && !blocked && <IconButton
            icon="video"
            label="Video call"
            onPress={() => go(`/calls/outgoing/${id}?type=video`)}
          />}
        </Row>
      }
      footer={
        blocked ? (
          <Notice error>
            You blocked this person. Unblock them to continue.
          </Notice>
        ) : (
          <Row
            style={{ backgroundColor: c.high, padding: 6, borderRadius: 32 }}
          >
            <TextInput
              accessibilityLabel={translate("Message")}
              placeholder={translate("Type a message…")}
              placeholderTextColor={c.muted}
              value={text}
              onChangeText={(v) => d.setDrafts((x) => ({ ...x, [id]: v }))}
              multiline
              maxLength={500}
              style={[
                s.input,
                {
                  flex: 1,
                  borderWidth: 0,
                  // Keep a one-line draft vertically centered in browsers while
                  // still allowing the composer to grow for longer messages.
                  minHeight: 44,
                  paddingHorizontal: 12,
                  paddingVertical: Platform.OS === "web" ? 11 : 10,
                  lineHeight: 22,
                  textAlignVertical: "center",
                  maxHeight: 110,
                  backgroundColor: "transparent",
                },
              ]}
            />
            <IconButton
              icon="send"
              label="Send message"
              active={!!text.trim()}
              onPress={send}
            />
          </Row>
        )
      }
    >
      {chatError ? <Notice error>{chatError}</Notice> : null}
      {messagesLoading ? <LoadingCards count={3} /> : liveMessages.map((m, index) => ({
        id: m.id,
        text: m.text,
        mine: m.sender_phone === auth.demoPhone,
        image: false,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        date: m.created_at,
        showDate: index === 0 || chatDateKey(liveMessages[index - 1].created_at) !== chatDateKey(m.created_at),
        failed: false,
      })).map((m) => (
          <Fragment key={m.id}>
            {m.showDate && <Row style={{ justifyContent: "center", marginTop: 8 }}><Chip title={formatChatDate(m.date)} /></Row>}
            <View
              style={{
                alignSelf: m.mine ? "flex-end" : "flex-start",
                maxWidth: "88%",
                gap: 5,
              }}
            >
            <Pressable
              onPress={() => (m.image ? go(`/media/${id}`) : undefined)}
              style={{
                padding: 17,
                borderRadius: 22,
                borderTopRightRadius: m.mine ? 4 : 22,
                borderTopLeftRadius: m.mine ? 22 : 4,
                backgroundColor: m.mine ? c.mint : c.low,
              }}
            >
              {m.image && (
                <Icon name="image" size={48} color={m.mine ? c.ink : c.mint} />
              )}
              <T color={m.mine ? c.ink : c.text}>{m.text}</T>
            </Pressable>
            <T mono size={10} color={m.failed ? c.error : c.muted}>
              {m.time}{" "}
              {m.mine ? (m.failed ? "· Failed" : "· Sent") : ""}
            </T>
            {m.failed && (
              <Button
                title="Retry message"
                variant="secondary"
                onPress={() =>
                  d.setMessages((v) =>
                    v.map((x) => (x.id === m.id ? { ...x, failed: false } : x)),
                  )
                }
              />
            )}
            </View>
          </Fragment>
        ))}
      {d.later && (
        <Button
          title="Rate call later"
          variant="secondary"
          onPress={() => go(`/rate/${id}`)}
        />
      )}
    </Shell>
  );
}
