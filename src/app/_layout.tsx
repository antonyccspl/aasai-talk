import { AuthProvider, useAuth } from "@/data/auth";
import {
    chargePhoneCallMinute,
    settlePhoneCall,
    subscribeToIncomingCalls,
    subscribeToPhoneCallState,
    updatePhoneCall,
} from "@/data/call-sessions";
import { startCallSound, stopCallSound } from "@/data/call-sounds";
import { fetchHostCurrentSlabs } from "@/data/host-metrics";
import { sendHostPresenceHeartbeat } from "@/data/host-presence";
import { SampleWorkspaceProvider } from "@/data/sample-workspace";
import { fetchPhoneWalletBalance } from "@/data/wallet";
import { sendPushEvent } from "@/data/push-notifications";
import { CoinPack, fetchCoinPacks } from "@/data/coin-packs";
import { DemoProvider, people, useDemo } from "@/ui/store";
import { LanguageProvider } from "@/ui/language";
import { ActivityIndicator, Animated, AppState, Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import type { NotificationResponse } from "expo-notifications";
import { colors } from "@/ui/theme";
import { Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold, useFonts } from "@expo-google-fonts/figtree";
import { Stack, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";

const phoneCallId = (value: string) => /^[0-9a-f-]{36}$/.test(value);

function activeSpecialOffers(packs: CoinPack[]) {
  const now = Date.now();
  return packs.filter((pack) => {
    if (!pack.is_special) return false;
    const startsAt = pack.available_from ? Date.parse(pack.available_from) : Number.NEGATIVE_INFINITY;
    const endsAt = pack.available_until ? Date.parse(pack.available_until) : Number.POSITIVE_INFINITY;
    return !Number.isNaN(startsAt) && !Number.isNaN(endsAt) && startsAt <= now && now < endsAt;
  });
}

function SpecialOfferWelcome() {
  const { authenticated, demoPhone } = useAuth();
  const { profile, setPack } = useDemo();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const [offers, setOffers] = useState<CoinPack[]>([]);
  const [visible, setVisible] = useState(false);
  const [offerIndex, setOfferIndex] = useState(0);
  const campaignRef = useRef("");
  const carouselRef = useRef<ScrollView>(null);

  useEffect(() => {
    const onboardingActive = pathname === "/auth" || pathname.startsWith("/auth/");
    const eligibleMember = profile.gender === "Male"
      && profile.guidelinesAccepted === true
      && profile.adultAgeConfirmed === true;
    if (!authenticated || !demoPhone || onboardingActive || !eligibleMember) {
      campaignRef.current = "";
      setVisible(false);
      setOffers([]);
      return;
    }
    const controller = new AbortController();
    let mounted = true;
    const load = async () => {
      try {
        const currentOffers = activeSpecialOffers(await fetchCoinPacks(controller.signal));
        if (!mounted || !currentOffers.length) return;
        const campaign = currentOffers
          .map((offer) => [offer.id, offer.coins, offer.bonus_coins, offer.price_paise, offer.available_from, offer.available_until].join(":"))
          .join("|");
        if (!mounted || campaignRef.current === campaign) return;
        campaignRef.current = campaign;
        setOffers(currentOffers);
        setOfferIndex(0);
        setVisible(true);
      } catch (error) {
        if (!controller.signal.aborted) console.info("Special offers are unavailable:", error);
      }
    };
    void load();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authenticated, demoPhone, pathname, profile.gender, profile.guidelinesAccepted, profile.adultAgeConfirmed]);

  const dismiss = (openWallet = false) => {
    setVisible(false);
    if (openWallet) {
      setPack(offers[offerIndex]?.coins ?? offers[0]?.coins ?? 0);
      router.push("/wallet" as never);
    }
  };

  if (!visible || !offers.length) return null;
  const maxBonus = Math.max(...offers.map((offer) => offer.bonus_coins));
  const compact = width < 380;
  const modalWidth = Math.min(width - 40, 390);
  const cardWidth = modalWidth - (compact ? 36 : 44);
  const moveToOffer = (nextIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(offers.length - 1, nextIndex));
    carouselRef.current?.scrollTo({ x: clampedIndex * modalWidth, animated: true });
    setOfferIndex(clampedIndex);
  };
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={() => dismiss(false)}>
      <View style={{ flex: 1, backgroundColor: "rgba(25, 21, 20, 0.52)", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <View style={{ width: modalWidth, borderRadius: 26, backgroundColor: "#1d1c1b", padding: compact ? 18 : 22, gap: 14, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 26, elevation: 16, overflow: "hidden" }}>
          <View pointerEvents="none" style={{ position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: "#e7b743", opacity: 0.14, right: -80, top: -85 }} />
          <View pointerEvents="none" style={{ position: "absolute", width: 95, height: 95, borderRadius: 48, backgroundColor: "#ff5a62", opacity: 0.13, left: -38, bottom: 80 }} />
          <View style={{ alignItems: "flex-start", gap: 4 }}>
            <Text style={{ color: "#f4c652", fontSize: 12, fontWeight: "800", letterSpacing: 0.8 }}>LIMITED-TIME BONUS</Text>
            <Text style={{ color: "#ffffff", fontSize: compact ? 23 : 26, lineHeight: compact ? 30 : 34, fontWeight: "800" }}>Your extra coins are here</Text>
            <Text style={{ color: "#d9d3cf", fontSize: 13, lineHeight: 19 }}>Pick a special pack and receive up to +{maxBonus.toLocaleString("en-IN")} bonus coins.</Text>
          </View>
          <ScrollView
            ref={carouselRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => setOfferIndex(Math.round(event.nativeEvent.contentOffset.x / modalWidth))}
            style={{ marginHorizontal: compact ? -18 : -22 }}
            contentContainerStyle={{ paddingHorizontal: compact ? 18 : 22 }}
          >
            {offers.map((offer) => (
              <View key={offer.id} style={{ width: cardWidth, borderRadius: 20, backgroundColor: "#fff8ed", padding: compact ? 16 : 18, alignItems: "center", gap: 3 }}>
                <Text style={{ color: "#ad6e12", fontSize: 11, fontWeight: "800", letterSpacing: 0.7 }}>SPECIAL OFFER</Text>
                <Text style={{ color: colors.text, fontSize: compact ? 34 : 38, lineHeight: compact ? 43 : 48, fontWeight: "800" }}>{offer.coins.toLocaleString("en-IN")}</Text>
                <Text style={{ color: colors.secondary, fontSize: 13, fontWeight: "700" }}>coins</Text>
                <View style={{ marginTop: 5, borderRadius: 999, backgroundColor: "#ffe1a4", paddingHorizontal: 12, paddingVertical: 5 }}>
                  <Text style={{ color: "#965905", fontSize: 12, fontWeight: "800" }}>+{offer.bonus_coins.toLocaleString("en-IN")} bonus coins</Text>
                </View>
                <Text style={{ color: colors.mint, fontSize: 16, fontWeight: "800", marginTop: 4 }}>₹{(offer.price_paise / 100).toLocaleString("en-IN")}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
            {offers.length > 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show previous special offer"
                accessibilityState={{ disabled: offerIndex === 0 }}
                disabled={offerIndex === 0}
                onPress={() => moveToOffer(offerIndex - 1)}
                style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: offerIndex === 0 ? "#413e3c" : "#fff8ed" }}
              >
                <Text style={{ color: offerIndex === 0 ? "#89827d" : "#1d1c1b", fontSize: 21, lineHeight: 22, fontWeight: "700" }}>‹</Text>
              </Pressable>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            {offers.map((offer, index) => <View key={offer.id} style={{ width: index === offerIndex ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: index === offerIndex ? "#f4c652" : "#736e6b" }} />)}
            </View>
            {offers.length > 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show next special offer"
                accessibilityState={{ disabled: offerIndex === offers.length - 1 }}
                disabled={offerIndex === offers.length - 1}
                onPress={() => moveToOffer(offerIndex + 1)}
                style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: offerIndex === offers.length - 1 ? "#413e3c" : "#fff8ed" }}
              >
                <Text style={{ color: offerIndex === offers.length - 1 ? "#89827d" : "#1d1c1b", fontSize: 21, lineHeight: 22, fontWeight: "700" }}>›</Text>
              </Pressable>
            )}
          </View>
          {offers.length > 1 && <Text style={{ color: "#d9d3cf", fontSize: 12, textAlign: "center" }}>Swipe to see the next offer</Text>}
          <Pressable accessibilityRole="button" onPress={() => dismiss(true)} style={{ minHeight: 48, borderRadius: 15, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>Choose this offer</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => dismiss(false)} style={{ minHeight: 34, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.secondary, fontSize: 13, fontWeight: "700" }}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function IncomingMessageBanner() {
  const { incomingMessageNotice, dismissIncomingMessageNotice, unreadMessageCount } = useDemo();
  const translateY = useRef(new Animated.Value(-180)).current;

  useEffect(() => {
    if (!incomingMessageNotice) return;
    translateY.setValue(-180);
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }).start();
    const timer = setTimeout(() => {
      Animated.timing(translateY, { toValue: -180, duration: 180, useNativeDriver: true })
        .start(({ finished }) => { if (finished) dismissIncomingMessageNotice(); });
    }, 5500);
    return () => clearTimeout(timer);
  }, [dismissIncomingMessageNotice, incomingMessageNotice?.id, translateY]);

  if (!incomingMessageNotice) return null;
  const senderId = `phone_${incomingMessageNotice.senderPhone.replace(/^\+/, "")}`;
  const sender = people.find((person) => person.id === senderId);
  const name = sender?.name || "New message";
  const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const openChat = () => {
    dismissIncomingMessageNotice();
    router.push(`/chat/${senderId}` as never);
  };
  return (
    <Animated.View pointerEvents="box-none" style={{ position: "absolute", top: 48, left: 12, right: 12, zIndex: 1000, transform: [{ translateY }] }}>
      <View style={{ backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: "#dfcef4", padding: 12, shadowColor: "#27123f", shadowOpacity: 0.16, shadowRadius: 14, elevation: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open message from ${name}`} onPress={openChat} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#eee5fa", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#d936a4", fontWeight: "800", fontSize: 14 }}>{initials}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: "#27123f", fontSize: 14, fontWeight: "800" }} numberOfLines={1}>{name}</Text>
            <Text style={{ color: "#664f7d", fontSize: 13 }} numberOfLines={1}>{incomingMessageNotice.text}</Text>
            <Text style={{ color: "#d936a4", fontSize: 11, fontWeight: "700" }}>Tap to reply{unreadMessageCount > 1 ? ` · ${unreadMessageCount} unread` : ""}</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message notification"
          onPress={dismissIncomingMessageNotice}
          hitSlop={10}
          style={{ padding: 6 }}
        >
          <Text style={{ color: "#664f7d", fontSize: 22, lineHeight: 22 }}>×</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

if (Platform.OS !== "web") {
  const Notifications = require("expo-notifications") as typeof import("expo-notifications");
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const foreground = AppState.currentState === "active";
      return {
        shouldShowBanner: !foreground,
        shouldShowList: !foreground,
        shouldPlaySound: !foreground,
        shouldSetBadge: false,
      };
    },
  });
}

/** Keeps a phone call authoritative even while its screen is not mounted. */
function ActiveCallLifecycle() {
  const { active, setActive, setBalance, setCalls, refreshWalletBalance } =
    useDemo();
  const { demoPhone, getIdentityToken } = useAuth();
  const activeRef = useRef(active);
  const chargedMinuteRef = useRef({ callId: "", minute: 0 });
  const chargingRef = useRef(false);
  const autoEndingRef = useRef("");
  activeRef.current = active;

  const finishFromServer = (status: string) => {
    const current = activeRef.current;
    if (!current) return;
    setCalls((history) => [
      {
        ...current,
        status: `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`,
      },
      ...history.filter((call) => call.id !== current.id),
    ]);
    setActive((value) => (value?.id === current.id ? null : value));
  };

  useEffect(() => {
    if (!active || !demoPhone || !phoneCallId(active.id)) return;
    return subscribeToPhoneCallState(
      active.id,
      demoPhone,
      ({ status, callType, videoUpgradeRequestedBy, remainingCoins }) => {
        const previous = activeRef.current;
        if (previous?.id === active.id && previous.type !== callType) {
          setActive((current) =>
            current?.id === active.id
              ? { ...current, type: callType }
              : current,
          );
          if (
            !previous.incoming &&
            callType === "video" &&
            previous.person.startsWith("phone_")
          ) {
            const hostPhone = `+${previous.person.slice("phone_".length)}`;
            void Promise.all([
              fetchHostCurrentSlabs(hostPhone),
              typeof remainingCoins === "number"
                ? Promise.resolve(remainingCoins)
                : fetchPhoneWalletBalance(demoPhone),
            ])
              .then(([slabs, currentBalance]) => {
                const rate = slabs.find((slab) => slab.call_type === "VIDEO");
                if (!rate) return;
                setBalance(currentBalance);
                const coinsPerMinute = Math.ceil(
                  rate.diamonds_per_minute * rate.coins_per_diamond,
                );
                setActive((current) => {
                  if (
                    !current ||
                    current.id !== active.id ||
                    current.incoming ||
                    current.type !== "video"
                  )
                    return current;
                  const remainder = 60 - (current.seconds % 60);
                  return {
                    ...current,
                    availableSeconds:
                      current.seconds +
                      remainder +
                      Math.floor(currentBalance / coinsPerMinute) * 60,
                  };
                });
              })
              .catch((error) =>
                console.error("Failed to recalculate video talk time:", error),
              );
          }
        }
        if (status === "connected") {
          setActive((current) =>
            current?.id === active.id
              ? {
                  ...current,
                  status: "Connected",
                  type: callType,
                  videoUpgradeRequestedBy,
                }
              : current,
          );
        } else if (status === "ringing") {
          setActive((current) =>
            current?.id === active.id
              ? { ...current, videoUpgradeRequestedBy }
              : current,
          );
        } else {
          finishFromServer(status);
        }
      },
    );
  }, [active?.id, demoPhone, setActive]);

  useEffect(() => {
    if (
      !active ||
      active.incoming ||
      active.status !== "Connected" ||
      !demoPhone ||
      !phoneCallId(active.id)
    )
      return;
    if (
      active.availableSeconds !== undefined &&
      active.seconds >= active.availableSeconds
    )
      return;
    if (chargedMinuteRef.current.callId !== active.id)
      chargedMinuteRef.current = { callId: active.id, minute: 0 };
    // Billing is prepaid by started minute: minute 1 at connection, minute 2
    // at 01:00, and so on. The server enforces the same boundary.
    const startedMinute = Math.floor(active.seconds / 60) + 1;
    const nextMinute = chargedMinuteRef.current.minute + 1;
    if (startedMinute < nextMinute || chargingRef.current) return;
    chargingRef.current = true;
    void chargePhoneCallMinute(active.id, demoPhone, nextMinute)
      .then(async (result) => {
        if (result.charged && !result.responseInvalid) {
          chargedMinuteRef.current = { callId: active.id, minute: nextMinute };
          if (typeof result.remaining_coins === "number")
            setBalance(result.remaining_coins);
          if (nextMinute === 1) {
            void getIdentityToken()
              .then((idToken) => sendPushEvent(idToken, "wallet", active.id, "call"))
              .catch((error) => console.warn("Unable to send wallet activity push:", error));
          }
          return;
        }
        if (!result.responseInvalid && result.insufficient_balance) {
          await updatePhoneCall(active.id, demoPhone, "ended", active.seconds);
          const settlement = await settlePhoneCall(active.id, demoPhone);
          await refreshWalletBalance();
          finishFromServer("ended");
          if (settlement.coins_charged >= 0) {
            // The next wallet refresh is authoritative after final settlement.
            console.info("Call ended for insufficient balance.");
          }
        }
      })
      .catch((error) =>
        console.error("Failed to charge started call minute:", error),
      )
      .finally(() => {
        chargingRef.current = false;
      });
  }, [
    active?.availableSeconds,
    active?.id,
    active?.incoming,
    active?.seconds,
    active?.status,
    demoPhone,
    refreshWalletBalance,
    setBalance,
  ]);

  useEffect(() => {
    if (
      !active ||
      active.incoming ||
      active.status !== "Connected" ||
      !demoPhone ||
      !phoneCallId(active.id) ||
      active.availableSeconds === undefined ||
      active.seconds < active.availableSeconds ||
      autoEndingRef.current === active.id
    )
      return;
    autoEndingRef.current = active.id;
    void (async () => {
      try {
        await updatePhoneCall(active.id, demoPhone, "ended", active.seconds);
        await settlePhoneCall(active.id, demoPhone);
        await refreshWalletBalance();
      } catch (error) {
        console.error("Failed to end call after its talk-time budget:", error);
      } finally {
        finishFromServer("ended");
      }
    })();
  }, [
    active?.availableSeconds,
    active?.id,
    active?.incoming,
    active?.seconds,
    active?.status,
    demoPhone,
    refreshWalletBalance,
  ]);

  return null;
}

function HostPresenceLifecycle() {
  const { demoPhone, getIdentityToken } = useAuth();
  const { hostStatus } = useDemo();

  useEffect(() => {
    if (!demoPhone || hostStatus !== "approved") return;
    let mounted = true;
    let heartbeatPending = false;
    const heartbeat = async () => {
      if (
        !mounted ||
        heartbeatPending ||
        AppState.currentState === "background" ||
        AppState.currentState === "inactive"
      ) return;
      heartbeatPending = true;
      try {
        await sendHostPresenceHeartbeat(await getIdentityToken());
      } catch (error) {
        if (mounted) console.warn("Unable to refresh Host presence:", error);
      } finally {
        heartbeatPending = false;
      }
    };
    void heartbeat();
    const interval = setInterval(() => void heartbeat(), 20000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void heartbeat();
    });
    return () => {
      mounted = false;
      clearInterval(interval);
      listener.remove();
    };
  }, [demoPhone, getIdentityToken, hostStatus]);

  return null;
}

function AppNavigator() {
  const { demoPhone, loading, authenticated } = useAuth();
  const { identityLoading } = useDemo();
  const incomingSessionRef = useRef("");
  const incomingSoundKeyRef = useRef("");
  const stopIncomingStatusRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (Platform.OS === "web" || loading || !authenticated) return;
    const Notifications = require("expo-notifications") as typeof import("expo-notifications");
    let mounted = true;
    const openNotificationRoute = (response: NotificationResponse | null) => {
      const route = response?.notification.request.content.data?.route;
      if (typeof route !== "string" || !/^\/(calls|chat|wallet|notifications)(\/|\?|$)/.test(route)) return;
      router.push(route as never);
    };
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (mounted) openNotificationRoute(response);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(openNotificationRoute);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [authenticated, loading]);
  useEffect(() => {
    if (loading || !authenticated || !demoPhone) return;
    const unsubscribe = subscribeToIncomingCalls(demoPhone, (call) => {
      if (incomingSessionRef.current === call.id) return;
      if (incomingSoundKeyRef.current) {
        void stopCallSound(incomingSoundKeyRef.current);
      }
      stopIncomingStatusRef.current?.();
      incomingSessionRef.current = call.id;
      const soundKey = `incoming-call-${call.id}`;
      incomingSoundKeyRef.current = soundKey;
      // Start alerting before navigation so the Host is notified immediately,
      // including when rendering the call screen takes a moment on mobile web.
      void startCallSound(soundKey, true, true).catch((error) =>
        console.warn("Unable to play the incoming-call alert:", error),
      );
      const stopWatching = subscribeToPhoneCallState(call.id, demoPhone, (state) => {
        if (state.status === "ringing") return;
        void stopCallSound(soundKey);
        if (incomingSoundKeyRef.current === soundKey)
          incomingSoundKeyRef.current = "";
        stopWatching();
      });
      stopIncomingStatusRef.current = stopWatching;
      router.replace(
        `/calls/incoming/phone_${call.caller_phone.replace(/^\+/, "")}?type=${call.call_type}&session=${call.id}&name=${encodeURIComponent(call.caller_username || "Caller")}` as never,
      );
    });
    return () => {
      unsubscribe();
      stopIncomingStatusRef.current?.();
      stopIncomingStatusRef.current = null;
      if (incomingSoundKeyRef.current)
        void stopCallSound(incomingSoundKeyRef.current);
      incomingSoundKeyRef.current = "";
    };
  }, [demoPhone, loading, authenticated]);
  if (authenticated && identityLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.mint} />
        <Text style={{ color: colors.secondary, fontSize: 14 }}>
          Loading your account…
        </Text>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <ActiveCallLifecycle />
      <HostPresenceLifecycle />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "none",
        }}
      />
      <IncomingMessageBanner />
      <SpecialOfferWelcome />
    </View>
  );
}

export default function Layout() {
  // Load bundled fonts without blocking navigation or authentication startup.
  useFonts({ Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold });
  return (
    <AuthProvider>
      <SampleWorkspaceProvider>
        <LanguageProvider>
          <DemoProvider>
            <AppNavigator />
          </DemoProvider>
        </LanguageProvider>
      </SampleWorkspaceProvider>
    </AuthProvider>
  );
}
