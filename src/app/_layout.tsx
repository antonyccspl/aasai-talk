import { endAndroidCallUi } from "@/data/android-incoming-calls";
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
import {
  sendPresenceHeartbeat,
  acknowledgeIncomingCall,
} from "@/data/host-presence";
import { sendPushEvent } from "@/data/push-notifications";
import { SampleWorkspaceProvider } from "@/data/sample-workspace";
import { fetchPhoneWalletBalance } from "@/data/wallet";
import { LanguageProvider } from "@/ui/language";
import { DemoProvider, people, useDemo } from "@/ui/store";
import { colors } from "@/ui/theme";
import { Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold, useFonts } from "@expo-google-fonts/figtree";
import { Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold } from "@expo-google-fonts/poppins";
import type { NotificationResponse } from "expo-notifications";
import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, AppState, Platform, Pressable, Text, View } from "react-native";

const phoneCallId = (value: string) => /^[0-9a-f-]{36}$/.test(value);

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
  const { active, profile, setActive, setBalance, setCalls, refreshWalletBalance } =
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
    if (current.incoming) endAndroidCallUi(current.id);
    setCalls((history) => [
      {
        ...current,
        status: `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`,
      },
      ...history.filter((call) => call.id !== current.id),
    ]);
    setActive((value) => (value?.id === current.id ? null : value));
    void refreshWalletBalance().catch((error) =>
      console.error("Failed to refresh wallet after call ended:", error),
    );
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
            profile.gender === "Male" &&
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
                    profile.gender !== "Male" ||
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
  }, [active?.id, demoPhone, profile.gender, refreshWalletBalance, setActive]);

  useEffect(() => {
    if (
      !active ||
      profile.gender !== "Male" ||
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
    profile.gender,
    refreshWalletBalance,
    setBalance,
  ]);

  useEffect(() => {
    if (
      !active ||
      profile.gender !== "Male" ||
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
    profile.gender,
    refreshWalletBalance,
  ]);

  return null;
}

function PresenceLifecycle() {
  const { demoPhone, getIdentityToken, authenticated, loading } = useAuth();

  useEffect(() => {
    if (loading || !authenticated || !demoPhone) return;
    let mounted = true;
    let heartbeatPending = false;
    const heartbeat = async () => {
      if (
        !mounted ||
        heartbeatPending ||
        (Platform.OS !== "web" && (AppState.currentState === "background" ||
        AppState.currentState === "inactive"))
      )
        return;
      heartbeatPending = true;
      try {
        await sendPresenceHeartbeat(await getIdentityToken());
      } catch (error) {
        if (mounted) console.warn("Unable to refresh online presence:", error);
      } finally {
        heartbeatPending = false;
      }
    };
    void heartbeat();
    const interval = setInterval(() => void heartbeat(), 30000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void heartbeat();
    });
    const resumeHeartbeat = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };
    if (Platform.OS === "web") {
      window.addEventListener("focus", resumeHeartbeat);
      window.addEventListener("pageshow", resumeHeartbeat);
      window.addEventListener("online", resumeHeartbeat);
      document.addEventListener("visibilitychange", resumeHeartbeat);
    }
    return () => {
      mounted = false;
      clearInterval(interval);
      listener.remove();
      if (Platform.OS === "web") {
        window.removeEventListener("focus", resumeHeartbeat);
        window.removeEventListener("pageshow", resumeHeartbeat);
        window.removeEventListener("online", resumeHeartbeat);
        document.removeEventListener("visibilitychange", resumeHeartbeat);
      }
    };
  }, [
    authenticated,
    demoPhone,
    getIdentityToken,
    loading,
  ]);

  return null;
}

function AppNavigator() {
  const {
    demoPhone,
    demoProfileComplete,
    loading,
    authenticated,
    getIdentityToken,
  } = useAuth();
  const { identityLoading, identityLoadError, retryIdentityLoad } = useDemo();
  const pathname = usePathname();
  const incomingSessionRef = useRef("");
  const incomingSoundKeyRef = useRef("");
  const stopIncomingStatusRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const loginRoute = pathname === "/auth/login";
    const onboardingRoute = pathname === "/auth" || pathname.startsWith("/auth/");
    const publicRoute =
      pathname === "/settings/delete-account" ||
      pathname === "/settings/policies" ||
      pathname.startsWith("/settings/policies/");
    if (
      loading ||
      identityLoading ||
      identityLoadError ||
      !authenticated ||
      !demoPhone ||
      publicRoute
    )
      return;
    if (loginRoute) {
      router.replace(demoProfileComplete ? "/explore" : "/auth/create-profile");
      return;
    }
    if (demoProfileComplete || onboardingRoute) return;
    router.replace("/auth/create-profile");
  }, [
    authenticated,
    demoPhone,
    demoProfileComplete,
    identityLoadError,
    identityLoading,
    loading,
    pathname,
  ]);
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
    const acknowledgeVisibleCall = () => {
      const visible = Platform.OS === "web" ? document.visibilityState === "visible" : AppState.currentState === "active";
      if (!visible || !incomingSessionRef.current) return;
      const callId = incomingSessionRef.current;
      void getIdentityToken().then((token) => acknowledgeIncomingCall(token, callId))
        .catch((error) => console.warn("Unable to confirm incoming call receipt:", error));
    };
    const resume = AppState.addEventListener("change", acknowledgeVisibleCall);
    if (Platform.OS === "web") document.addEventListener("visibilitychange", acknowledgeVisibleCall);
    const unsubscribe = subscribeToIncomingCalls(demoPhone, (call) => {
      if (incomingSessionRef.current === call.id) return;
      if (incomingSoundKeyRef.current) {
        void stopCallSound(incomingSoundKeyRef.current);
      }
      stopIncomingStatusRef.current?.();
      incomingSessionRef.current = call.id;
      acknowledgeVisibleCall();
      const soundKey = `incoming-call-${call.id}`;
      incomingSoundKeyRef.current = soundKey;
      // Start alerting before navigation so the recipient is notified
      // immediately, including when rendering takes a moment on mobile web.
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
        `/calls/incoming/phone_${call.caller_phone.replace(/^\+/, "")}?type=${call.call_type}&session=${call.id}&name=${encodeURIComponent(call.caller_name || "Aasai Talk member")}` as never,
      );
    });
    return () => {
      unsubscribe();
      resume.remove();
      if (Platform.OS === "web") document.removeEventListener("visibilitychange", acknowledgeVisibleCall);
      stopIncomingStatusRef.current?.();
      stopIncomingStatusRef.current = null;
      if (incomingSoundKeyRef.current)
        void stopCallSound(incomingSoundKeyRef.current);
      incomingSoundKeyRef.current = "";
    };
  }, [demoPhone, loading, authenticated, getIdentityToken]);
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
  if (authenticated && identityLoadError) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: 24,
          backgroundColor: colors.background,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
          We couldn’t load your account.
        </Text>
        <Text style={{ color: colors.secondary, fontSize: 14, textAlign: "center" }}>
          Check your connection and try again.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void retryIdentityLoad()}
          style={{
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: colors.mint,
          }}
        >
          <Text style={{ color: colors.background, fontWeight: "700" }}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar
        style={
          pathname === "/auth/splash" ||
          pathname === "/auth/login" ||
          pathname === "/auth/otp"
            ? "light"
            : "dark"
        }
      />
      <ActiveCallLifecycle />
      <PresenceLifecycle />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "none",
        }}
      />
      <IncomingMessageBanner />
    </View>
  );
}

export default function Layout() {
  // Load bundled fonts without blocking navigation or authentication startup.
  useFonts({
    Figtree_400Regular,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });
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


//npx eas-cli@latest build --platform android --profile preview --clear-cache
