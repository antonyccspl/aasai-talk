import { Stack, router } from "expo-router";
import { useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import { Animated, Pressable, Text, View } from "react-native";
import { DemoProvider, people, useDemo } from "@/ui/store";
import { colors } from "@/ui/theme";
import { SampleWorkspaceProvider } from "@/data/sample-workspace";
import { AuthProvider, useAuth } from "@/data/auth";
import {
  chargePhoneCallMinute,
  settlePhoneCall,
  subscribeToIncomingCalls,
  subscribeToPhoneCallState,
  updatePhoneCall,
} from "@/data/call-sessions";
import { fetchHostCurrentSlabs } from "@/data/host-metrics";
import { fetchPhoneWalletBalance } from "@/data/wallet";

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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open message from ${name}`}
        onPress={openChat}
        style={{ backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: "#dfcef4", padding: 12, shadowColor: "#27123f", shadowOpacity: 0.16, shadowRadius: 14, elevation: 12, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#eee5fa", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#d936a4", fontWeight: "800", fontSize: 14 }}>{initials}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: "#27123f", fontSize: 14, fontWeight: "800" }} numberOfLines={1}>{name}</Text>
          <Text style={{ color: "#664f7d", fontSize: 13 }} numberOfLines={1}>{incomingMessageNotice.text}</Text>
          <Text style={{ color: "#d936a4", fontSize: 11, fontWeight: "700" }}>Tap to reply{unreadMessageCount > 1 ? ` · ${unreadMessageCount} unread` : ""}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message notification"
          onPress={(event) => { event.stopPropagation(); dismissIncomingMessageNotice(); }}
          hitSlop={10}
          style={{ padding: 6 }}
        >
          <Text style={{ color: "#664f7d", fontSize: 22, lineHeight: 22 }}>×</Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

/** Keeps a phone call authoritative even while its screen is not mounted. */
function ActiveCallLifecycle() {
  const { active, setActive, setBalance, setCalls, refreshWalletBalance } =
    useDemo();
  const { demoPhone } = useAuth();
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

function AppNavigator() {
  const { demoPhone, loading, authenticated } = useAuth();
  const incomingSessionRef = useRef("");
  useEffect(() => {
    if (loading || !authenticated || !demoPhone) return;
    return subscribeToIncomingCalls(demoPhone, (call) => {
      if (incomingSessionRef.current === call.id) return;
      incomingSessionRef.current = call.id;
      router.replace(
        `/calls/incoming/phone_${call.caller_phone.replace(/^\+/, "")}?type=${call.call_type}&session=${call.id}` as never,
      );
    });
  }, [demoPhone, loading, authenticated]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <ActiveCallLifecycle />
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
  return (
    <AuthProvider>
      <SampleWorkspaceProvider>
        <DemoProvider>
          <AppNavigator />
        </DemoProvider>
      </SampleWorkspaceProvider>
    </AuthProvider>
  );
}
