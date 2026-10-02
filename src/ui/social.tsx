import { useAuth } from "@/data/auth";
import { fetchPhoneConversations, fetchPhoneMessages, markPhoneConversationRead, sendPhoneMessage, subscribeToAllPhoneMessages, subscribeToPhoneMessages, type PhoneMessage } from "@/data/chat";
import { fetchPhoneHostDashboard, type HostDashboard } from "@/data/host-dashboard";
import { fetchHostEarningSlabs, type HostEarningSlab } from "@/data/host-metrics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, TextInput, useWindowDimensions, View } from "react-native";
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
    Notice,
    Row,
    s,
    Section,
    Shell,
    T,
    UserCard,
} from "./components";
import { defaultFacets, people, personFor, useDemo } from "./store";
import { colors as c } from "./theme";

const formatCallTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};
const formatRupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function HostDashboardHome() {
  const auth = useAuth();
  const d = useDemo();
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
        <T size={24} bold>{d.profile.name ? `Hi, ${d.profile.name}` : "Welcome back"}</T>
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

export function Discovery({ mode = "explore" }: { mode?: string }) {
  const d = useDemo();
  const refreshPeople = useRefreshPeople();
  const isHost = d.hostStatus === "approved";
  const wideLayout = useWindowDimensions().width >= 768;
  const [refreshing, setRefreshing] = useState(false);
  const searching = mode === "search";
  const favorites = mode === "favorites";
  useEffect(() => {
    if ((mode !== "search" && mode !== "explore" && mode !== "favorites") || (isHost && mode === "explore"))
      return;
    let mounted = true;
    let loading = false;
    const refreshDirectory = async () => {
      if (!mounted || loading) return;
      loading = true;
      try {
        await refreshPeople();
      } finally {
        loading = false;
      }
    };
    void refreshDirectory();
    const interval = setInterval(() => void refreshDirectory(), 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isHost, mode, refreshPeople]);
  if (isHost && mode === "explore") return <HostDashboardHome />;
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
          ? async () => {
              setRefreshing(true);
              d.refreshSlabs();
              try { await refreshPeople(); } finally { setRefreshing(false); }
            }
          : undefined
      }
    >
      <>
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
      {mode === "explore" && <Chips items={["All", "Online", "Hindi", "Tamil", "English"]} selected={d.filter === "Available" ? "Online" : d.filter} onChange={(value) => d.setFilter(value === "Online" ? "Available" : value)} />}
      {mode === "explore" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {result.map((p, index) => <UserCard key={p.id} person={p} grid index={index} />)}
          {result.length % 2 === 1 && <View style={{ width: "48%", flexGrow: 1 }} />}
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
      {!result.length && (
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
export function Filters() {
  const d = useDemo();
  const [draft, setDraft] = useState(d.facets);
  const [error, setError] = useState("");
  const choose = (key: keyof typeof draft, value: string) =>
    setDraft((x) => ({ ...x, [key]: value }));
  return (
    <Shell title="Find your people">
      <T size={24} bold>
        A little more in common.
      </T>
      <T color={c.secondary}>Combine filters to find your next conversation.</T>
      <Section title="Availability" />
      <Chips
        items={["All", "Available", "Busy", "Offline"]}
        selected={draft.availability}
        onChange={(v) => choose("availability", v)}
      />
      <Section title="Language" />
      <Chips
        items={["All", "Hindi", "English", "Kannada", "Tamil"]}
        selected={draft.language}
        onChange={(v) => choose("language", v)}
      />
      <Section title="Gender" />
      <Chips
        items={["All", "Woman", "Man"]}
        selected={draft.gender}
        onChange={(v) => choose("gender", v)}
      />
      <Section title="Age range" />
      <Row>
        <View style={{ flex: 1 }}>
          <Field
            label="Minimum age"
            numeric
            value={draft.minAge}
            onChange={(v) => choose("minAge", v)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Maximum age"
            numeric
            value={draft.maxAge}
            onChange={(v) => choose("maxAge", v)}
          />
        </View>
      </Row>
      <Section title="Interests" />
      <Chips
        items={["All", "Music", "Poetry", "Travel", "Books", "Coffee"]}
        selected={draft.interest}
        onChange={(v) => choose("interest", v)}
      />
      {d.paid && (
        <Field
          label="Maximum audio price / minute (₹)"
          numeric
          value={draft.maxPrice}
          onChange={(v) => choose("maxPrice", v)}
        />
      )}
      {error && <Notice error>{error}</Notice>}
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
    </Shell>
  );
}
export function UserProfile({ id }: { id: string }) {
  const p = personFor(id);
  const d = useDemo();
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
  const [conversations, setConversations] = useState<{ otherPhone: string; text: string; time: string; username?: string | null; displayName?: string | null; avatarUrl?: string | null; isHost?: boolean }[]>([]);
  const loadConversations = async () => {
    if (!auth.demoPhone) return;
    const rows = await fetchPhoneConversations(auth.demoPhone);
    setConversations(rows.map((row) => ({
      otherPhone: row.other_phone,
      text: row.last_text,
      time: new Date(row.last_created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      username: row.other_username,
      displayName: row.other_display_name,
      avatarUrl: row.other_avatar_url,
      isHost: row.other_is_host,
    })));
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
      <Section
        title="Messages"
        action="New chat"
        onPress={() => go("/search")}
      />
      <Field
        label="Search conversations"
        placeholder="Find a conversation"
        value={query}
        onChange={setQuery}
      />
      {list.map(({ person, conversation }) => {
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
      {!list.length && (
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
    if (!auth.demoPhone || !otherPhone) return;
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
      .catch((error) => { if (active) setChatError(error instanceof Error ? error.message : "Unable to load messages."); });
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
      .then(({ message, remainingCoins }) => {
        d.setBalance(remainingCoins);
        setLiveMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
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
              accessibilityLabel="Message"
              placeholder="Type a message…"
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
                  padding: 4,
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
            {blocked ? "BLOCKED" : p.status.toUpperCase()}
          </T>
        </View>
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
      <Row style={{ justifyContent: "center" }}>
        <Chip title="Today" />
      </Row>
      {chatError ? <Notice error>{chatError}</Notice> : null}
      {(liveMessages.length ? liveMessages.map((m) => ({
        id: m.id,
        text: m.text,
        mine: m.sender_phone === auth.demoPhone,
        image: false,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        failed: false,
      })) : d.messages.filter((m) => m.user === id)).map((m) => (
          <View
            key={m.id}
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
