import {
    fetchHostCurrentSlabs,
    type HostCurrentSlab,
} from "@/data/host-metrics";
import { Feather, FontAwesome6 } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    Animated,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TextStyle,
    useWindowDimensions,
    View,
    ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { coins, duration, Person, personFor, talkTime, useDemo } from "./store";
import { colors as c, fonts } from "./theme";
export type IconName = React.ComponentProps<typeof Feather>["name"];
export const go = (path: string) => router.push(path as never);
export function T({
  children,
  size = 14,
  color = c.text,
  bold,
  mono,
  style,
  ...rest
}: {
  children?: React.ReactNode;
  size?: number;
  color?: string;
  bold?: boolean;
  mono?: boolean;
  style?: TextStyle;
} & Omit<React.ComponentProps<typeof Text>, "style">) {
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: mono ? fonts.mono : bold ? fonts.bold : fonts.regular,
          fontSize: size,
          lineHeight: size * 1.45,
          color,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Icon({
  name,
  color = c.secondary,
  size = 22,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return <Feather name={name} size={size} color={color} />;
}
export function AasaiTalkMark({ size = 32 }: { size?: number }) {
  return (
    <Image
      source={require("../../assets/images/aasai-talk-logo.jpg")}
      accessibilityLabel="Aasai Talk"
      style={{ width: size, height: size, borderRadius: size * 0.24 }}
      resizeMode="contain"
    />
  );
}
export function CoinStack({ size = 28 }: { size?: number }) {
  return (
    <FontAwesome6
      name="coins"
      size={size}
      color="#e7b84f"
      accessibilityLabel="Coins"
    />
  );
}
export function DiamondMark({ size = 14 }: { size?: number }) {
  return (
    <FontAwesome6
      name="gem"
      size={size}
      color="#5de6e7"
      accessibilityLabel="Diamond"
    />
  );
}
export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[s.row, style]}>{children}</View>;
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[s.card, { backgroundColor: c.low }, style]}>{children}</View>
  );
}
export function Button({
  title,
  onPress,
  icon,
  variant = "primary",
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const color =
    variant === "primary" || variant === "danger" ? c.ink : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor:
            variant === "primary"
              ? c.mint
              : variant === "danger"
                ? c.danger
                : c.high,
          opacity: disabled ? 0.4 : pressed ? 0.72 : 1,
        },
        style,
      ]}
    >
      {icon && <Icon name={icon} color={color} size={20} />}
      <T bold color={color} style={{ flexShrink: 1, textAlign: "center" }}>
        {title}
      </T>
    </Pressable>
  );
}
export function IconButton({
  icon,
  label,
  onPress,
  active,
  danger,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        s.iconButton,
        {
          opacity: pressed ? 0.6 : 1,
          backgroundColor: danger ? c.danger : active ? c.mint : c.high,
        },
      ]}
    >
      <Icon name={icon} color={danger || active ? c.ink : c.text} />
    </Pressable>
  );
}
export function Chip({
  title,
  selected,
  onPress,
}: {
  title: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        s.chip,
        {
          backgroundColor: selected ? c.mint : c.high,
          minHeight: onPress ? 40 : 24,
        },
      ]}
    >
      <T size={onPress ? 11 : 10} mono color={selected ? c.ink : c.secondary}>
        {title}
      </T>
    </Pressable>
  );
}
export function Chips({
  items,
  selected,
  onChange,
}: {
  items: string[];
  selected: string;
  onChange: (v: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
    >
      {items.map((item) => (
        <Chip
          key={item}
          title={item}
          selected={item === selected}
          onPress={() => onChange(item)}
        />
      ))}
    </ScrollView>
  );
}
export function Avatar({
  person,
  name,
  size = 52,
  square = false,
}: {
  person?: Person;
  /** Optional name for an unsaved signed-in profile preview. */
  name?: string;
  size?: number;
  square?: boolean;
}) {
  const { photo, profile } = useDemo();
  const avatarUri = person ? person.photo : photo;
  // When this is the signed-in user's avatar there is no `person` object.
  // Use the saved profile name so a profile edit is reflected immediately.
  const avatarName = person?.name || name || profile.name || "M";
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatarUri]);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: square ? 20 : size / 2,
        // Directory records may contain older green accent colors. Avatars are
        // deliberately theme-owned so every profile stays in the Aasai palette.
        backgroundColor: c.high,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {avatarUri && !failed ? (
        <Image
          source={{ uri: avatarUri }}
          accessibilityLabel={`${avatarName} profile photo`}
          style={{ width: size, height: size }}
          onError={() => setFailed(true)}
        />
      ) : (
        <T size={size * 0.32} bold color={c.mint}>
          {avatarName
            .split(" ")
            .map((x) => x[0])
            .join("")
            .toUpperCase() || "M"}
        </T>
      )}
    </View>
  );
}
export function Badge({ text, warning }: { text: string; warning?: boolean }) {
  return (
    <Row
      style={{
        gap: 6,
        alignSelf: "flex-start",
        backgroundColor: c.high,
        borderRadius: 99,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: warning ? c.warning : c.mint,
        }}
      />
      <T mono size={11} color={warning ? c.warning : c.mint}>
        {text}
      </T>
    </Row>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  multiline,
  numeric,
  secure,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  multiline?: boolean;
  numeric?: boolean;
  secure?: boolean;
}) {
  return (
    <View style={{ gap: 7 }}>
      <T size={13} color={c.secondary}>
        {String(label)}
      </T>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        secureTextEntry={secure}
        keyboardType={numeric ? "number-pad" : "default"}
        multiline={multiline}
        autoCapitalize={
          secure || /username|code|email/i.test(label) ? "none" : "sentences"
        }
        style={[
          s.input,
          {
            minHeight: multiline ? 92 : 48,
            borderColor: error ? c.error : c.line,
            backgroundColor: c.surface,
            color: c.text,
          },
        ]}
      />
      {error ? (
        <T size={12} color={c.error}>
          {String(error)}
        </T>
      ) : null}
    </View>
  );
}
export function Section({
  title,
  action,
  actionIcon,
  onPress,
}: {
  title: string;
  action?: string;
  actionIcon?: IconName;
  onPress?: () => void;
}) {
  return (
    <Row style={{ justifyContent: "space-between", marginTop: 8 }}>
      <T size={17} bold>
        {title}
      </T>
      {action && (
        <Pressable
          onPress={onPress}
          accessibilityLabel={action}
          accessibilityRole="button"
          style={{
            minHeight: 48,
            minWidth: actionIcon ? 48 : undefined,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {actionIcon ? (
            <Icon name={actionIcon} size={19} color={c.mint} />
          ) : (
            <T size={12} mono color={c.mint}>
              {action}
            </T>
          )}
        </Pressable>
      )}
    </Row>
  );
}
export function Setting({
  title,
  detail,
  icon = "chevron-right",
  onPress,
  value,
  onToggle,
}: {
  title: string;
  detail?: string;
  icon?: IconName;
  onPress?: () => void;
  value?: boolean;
  onToggle?: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={[s.setting, { backgroundColor: c.low }]}
    >
      <Icon name={icon} color={c.mint} />
      <View style={{ flex: 1 }}>
        <T bold size={14}>
          {title}
        </T>
        {detail && (
          <T size={12} color={c.muted}>
            {detail}
          </T>
        )}
      </View>
      {onToggle ? (
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: c.line, true: c.mint }}
          thumbColor={value ? c.ink : c.text}
        />
      ) : onPress ? (
        <Icon name="chevron-right" size={18} />
      ) : null}
    </Pressable>
  );
}
export function Notice({
  children,
  error,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: error ? c.errorSurface : c.successSurface,
        padding: 14,
        borderRadius: 16,
      }}
    >
      <T size={13} color={error ? c.error : c.secondary}>
        {children}
      </T>
    </View>
  );
}
export function Empty({
  title,
  message,
  icon = "message-circle",
  action,
  onPress,
}: {
  title: string;
  message: string;
  icon?: IconName;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={{ paddingVertical: 50, alignItems: "center", gap: 16 }}>
      <View style={[s.emptyIcon, { backgroundColor: c.high }]}>
        <Icon name={icon} size={32} color={c.mint} />
      </View>
      <T bold size={22} style={{ textAlign: "center" }}>
        {title}
      </T>
      <T color={c.secondary} style={{ textAlign: "center", maxWidth: 310 }}>
        {message}
      </T>
      {action && onPress && <Button title={action} onPress={onPress} />}
    </View>
  );
}
export function Wave({ large }: { large?: boolean }) {
  return (
    <Row
      style={{
        justifyContent: "center",
        gap: large ? 6 : 3,
        height: large ? 58 : 25,
      }}
    >
      {[12, 24, 38, 54, 28, 48, 36, 44, 56, 32, 23, 13].map((h, i) => (
        <View
          key={i}
          style={{
            width: 4,
            borderRadius: 4,
            height: large ? h : h / 3,
            backgroundColor: c.mint,
            opacity: i % 3 === 0 ? 0.4 : 1,
          }}
        />
      ))}
    </Row>
  );
}
export function UserCard({ person }: { person: Person }) {
  const [hostSlabs, setHostSlabs] = useState<HostCurrentSlab[]>([]);
  const [slabsLoading, setSlabsLoading] = useState(false);
  const hostPhone = person.id.startsWith("phone_")
    ? `+${person.id.slice("phone_".length)}`
    : "";
  useEffect(() => {
    if (!hostPhone) return;
    let active = true;
    setSlabsLoading(true);
    void fetchHostCurrentSlabs(hostPhone)
      .then((rows) => {
        if (active) setHostSlabs(rows);
      })
      .catch((error) => {
        console.error("Failed to load Host call rates:", error);
        if (active) setHostSlabs([]);
      })
      .finally(() => {
        if (active) setSlabsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hostPhone]);
  const audioRate = hostSlabs.find(
    (row) => row.call_type === "AUDIO",
  )?.diamonds_per_minute;
  const videoRate = hostSlabs.find(
    (row) => row.call_type === "VIDEO",
  )?.diamonds_per_minute;
  const pulse = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.8,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.2,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  const statusColor =
    person.status === "Available"
      ? c.mint
      : person.status === "Busy"
        ? c.warning
        : c.error;
  return (
    <Card style={{ position: "relative" }}>
      <Animated.View
        accessibilityLabel={`${person.status} presence`}
        style={{
          position: "absolute",
          right: 12,
          top: 12,
          width: 14,
          height: 14,
          borderRadius: 99,
          backgroundColor: statusColor,
          opacity: pulse,
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0.2, 0.8],
                outputRange: [0.8, 1.18],
              }),
            },
          ],
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: 16,
          top: 16,
          width: 6,
          height: 6,
          borderRadius: 99,
          backgroundColor: statusColor,
          borderWidth: 1,
          borderColor: c.low,
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${person.name}`}
        onPress={() => go(`/user/${person.id}`)}
      >
        <Row style={{ alignItems: "flex-start" }}>
          <Avatar person={person} size={60} square />
          <View style={{ flex: 1, gap: 3 }}>
            <T bold size={16}>
              {person.name}, {person.age}
            </T>
            <T size={12} color={c.secondary}>
              {person.city} · {person.languages.join(" · ")}
            </T>
          </View>
        </Row>
      </Pressable>
      <Row style={{ flexWrap: "wrap", gap: 6 }}>
        {person.interests.map((x) => (
          <Chip key={x} title={x} />
        ))}
      </Row>
      {person.status === "Available" ? (
        <Row>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Audio call with ${person.name}, ${audioRate === undefined ? "rate unavailable" : `${audioRate} diamonds per minute`}`}
            onPress={() => go(`/calls/outgoing/${person.id}?type=audio`)}
            style={[
              s.button,
              {
                flex: 1,
                paddingHorizontal: 6,
                backgroundColor: c.high,
              },
            ]}
          >
            <Row style={{ gap: 5, justifyContent: "center" }}>
              <Icon name="phone" size={17} color={c.mint} />
              <T bold size={12}>
                Audio
              </T>
              <DiamondMark size={9} />
              <T mono size={10} color={c.secondary}>
                {slabsLoading
                  ? "…"
                  : audioRate === undefined
                    ? "—"
                    : `${audioRate}/min`}
              </T>
            </Row>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Video call with ${person.name}, ${videoRate === undefined ? "rate unavailable" : `${videoRate} diamonds per minute`}`}
            onPress={() => go(`/calls/outgoing/${person.id}?type=video`)}
            style={[
              s.button,
              {
                flex: 1,
                paddingHorizontal: 6,
                backgroundColor: c.high,
              },
            ]}
          >
            <Row style={{ gap: 5, justifyContent: "center" }}>
              <Icon name="video" size={17} color={c.mint} />
              <T bold size={12}>
                Video
              </T>
              <DiamondMark size={9} />
              <T mono size={10} color={c.secondary}>
                {slabsLoading
                  ? "…"
                  : videoRate === undefined
                    ? "—"
                    : `${videoRate}/min`}
              </T>
            </Row>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Message ${person.name}`}
            onPress={() => go(`/chat/${person.id}`)}
            style={[
              s.button,
              { width: 48, paddingHorizontal: 0, backgroundColor: c.high },
            ]}
          >
            <Icon name="message-circle" size={20} color={c.mint} />
          </Pressable>
        </Row>
      ) : (
        <Row>
          <View style={[s.button, { flex: 1, backgroundColor: c.high }]}>
            <Icon
              name={person.status === "Busy" ? "phone-off" : "slash"}
              size={18}
              color={statusColor}
            />
            <T bold color={statusColor}>
              {person.status === "Busy" ? "Busy on another call" : "Offline"}
            </T>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Message ${person.name}`}
            onPress={() => go(`/chat/${person.id}`)}
            style={[
              s.button,
              { width: 48, paddingHorizontal: 0, backgroundColor: c.high },
            ]}
          >
            <Icon name="message-circle" size={20} color={c.mint} />
          </Pressable>
        </Row>
      )}
    </Card>
  );
}
function PageSkeleton() {
  return (
    <View style={{ gap: 14 }} accessibilityLabel="Loading page">
      <View
        style={{
          height: 20,
          width: "42%",
          borderRadius: 8,
          backgroundColor: c.high,
        }}
      />
      {[0, 1, 2].map((item) => (
        <View
          key={item}
          style={{
            backgroundColor: c.low,
            borderRadius: 22,
            padding: 16,
            gap: 12,
          }}
        >
          <View
            style={{
              height: 14,
              width: "62%",
              borderRadius: 8,
              backgroundColor: c.high,
            }}
          />
          <View
            style={{
              height: 12,
              width: "85%",
              borderRadius: 8,
              backgroundColor: c.high,
            }}
          />
          <View
            style={{ height: 48, borderRadius: 99, backgroundColor: c.high }}
          />
        </View>
      ))}
    </View>
  );
}
export function Shell({
  title,
  tab,
  children,
  immersive,
  footer,
  scroll = true,
  refreshing,
  onRefresh,
  skipSkeleton = false,
  scrollToEndToken,
}: {
  title?: string;
  tab?: string;
  children: React.ReactNode;
  immersive?: boolean;
  footer?: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  skipSkeleton?: boolean;
  /** Change this value to bring a conversation to its latest message. */
  scrollToEndToken?: string;
}) {
  const d = useDemo();
  const scrollRef = useRef<ScrollView>(null);
  const isApprovedHost = d.hostStatus === "approved";
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 220);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!scrollToEndToken) return;
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [scrollToEndToken]);
  useEffect(() => {
    // Keep a conversation's composer and newest message visible when the
    // software keyboard reduces the available screen height.
    if (!scrollToEndToken) return;
    const event = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const subscription = Keyboard.addListener(event, () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    });
    return () => subscription.remove();
  }, [scrollToEndToken]);
  const compact = useWindowDimensions().width < 400;
  const tabs: [string, IconName, string][] = [
    ["Explore", "compass", "/explore"],
    ["Calls", "phone", "/calls"],
    ["Messages", "message-square", "/messages"],
    ...(d.paid && !isApprovedHost
      ? [["Wallet", "credit-card", "/wallet"] as [string, IconName, string]]
      : []),
  ];
  const safeChildren = React.Children.toArray(children).filter(
    (child) => typeof child !== "string",
  );
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[s.frame, { backgroundColor: c.background }]}>
          <Row style={s.header}>
            {title ? (
              <>
                <IconButton
                  icon="arrow-left"
                  label="Go back"
                  onPress={() =>
                    router.replace(
                      title === "Create your profile"
                        ? "/auth/login"
                        : "/explore",
                    )
                  }
                />
                <T bold size={18} numberOfLines={1} style={{ flex: 1 }}>
                  {title}
                </T>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => go("/explore")}
                style={[s.row, { flex: 1 }]}
              >
                <AasaiTalkMark size={30} />
                <T
                  bold
                  size={21}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ flexShrink: 1 }}
                >
                  Aasai Talk
                </T>
              </Pressable>
            )}
            {!immersive && (
              <>
                {d.paid && !isApprovedHost && !title && !compact && (
                  <Pressable
                    onPress={() => go("/wallet")}
                    style={[
                      s.balance,
                      { backgroundColor: c.high, borderColor: c.line },
                    ]}
                    accessibilityLabel="Open wallet"
                  >
                    <CoinStack size={21} />
                    <T mono size={12}>
                      {coins(d.balance)}
                    </T>
                  </Pressable>
                )}
                {!title && (
                  <View>
                    <IconButton
                      icon="bell"
                      label="Notifications"
                      onPress={() => go("/notifications")}
                    />
                    {d.unreadNotificationCount > 0 && (
                      <View
                        style={{
                          position: "absolute", top: -3, right: -3, minWidth: 17, height: 17,
                          paddingHorizontal: 4, borderRadius: 9, backgroundColor: c.danger,
                          alignItems: "center", justifyContent: "center",
                        }}
                        pointerEvents="none"
                      >
                        <T size={9} bold color="#fff">
                          {d.unreadNotificationCount > 99 ? "99+" : d.unreadNotificationCount}
                        </T>
                      </View>
                    )}
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="My profile"
                  onPress={() => go("/profile")}
                  style={{ padding: 4 }}
                >
                  <Avatar size={36} />
                </Pressable>
              </>
            )}
          </Row>
          {d.active && !immersive && (
            <Pressable
              onPress={() =>
                go(
                  `/calls/${d.active!.type}/${d.active!.person}${d.active!.status === "Connected" ? `?session=${d.active!.id}` : ""}`,
                )
              }
              style={[s.ongoing, { backgroundColor: c.successSurface }]}
            >
              <Icon name="phone" color={c.mint} size={16} />
              <T size={12} color={c.mint}>
                {personFor(d.active.person).name} ·{" "}
                {d.active.incoming
                  ? duration(d.active.seconds)
                  : talkTime(
                      Math.max(
                        0,
                        (d.active.availableSeconds ?? 0) - d.active.seconds,
                      ),
                    )}{" "}
                · Return to call
              </T>
            </Pressable>
          )}
          {scroll ? (
            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                onRefresh ? (
                  <RefreshControl
                    refreshing={Boolean(refreshing)}
                    onRefresh={onRefresh}
                    tintColor={c.mint}
                    colors={[c.mint]}
                  />
                ) : undefined
              }
              contentContainerStyle={[
                s.content,
                { paddingBottom: tab ? 112 : 28 },
              ]}
            >
              {loading && !skipSkeleton ? <PageSkeleton /> : safeChildren}
            </ScrollView>
          ) : (
            <View style={[s.content, { flex: 1 }]}>
              {loading && !skipSkeleton ? <PageSkeleton /> : safeChildren}
            </View>
          )}
          {footer && (
            <View style={{ padding: 16, backgroundColor: c.background }}>
              {footer}
            </View>
          )}
          {tab && (
            <View style={[s.dock, { backgroundColor: c.low }]}>
              {tabs.map(([name, icon, path]) => (
                <Pressable
                  key={name}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === name }}
                  onPress={() => router.replace(path as never)}
                  style={[s.tab, tab === name && { backgroundColor: c.high }]}
                >
                  <View>
                    <Icon
                      name={icon}
                      color={tab === name ? c.mint : c.secondary}
                      size={21}
                    />
                    {name === "Messages" && d.unreadMessageCount > 0 && (
                      <View
                        style={{
                          position: "absolute", top: -8, right: -12, minWidth: 17, height: 17,
                          paddingHorizontal: 4, borderRadius: 9, backgroundColor: c.danger,
                          alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <T size={9} bold color="#fff">
                          {d.unreadMessageCount > 99 ? "99+" : d.unreadMessageCount}
                        </T>
                      </View>
                    )}
                  </View>
                  <T mono size={10} color={tab === name ? c.mint : c.secondary}>
                    {name}
                  </T>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  frame: { flex: 1, width: "100%", maxWidth: 560, alignSelf: "center" },
  header: { minHeight: 60, paddingHorizontal: 16, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  content: { padding: 16, gap: 16 },
  card: { backgroundColor: c.low, borderRadius: 22, padding: 16, gap: 12 },
  button: {
    minHeight: 48,
    borderRadius: 99,
    paddingHorizontal: 18,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 99,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: c.text,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
  },
  setting: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.low,
    padding: 14,
    minHeight: 60,
    borderRadius: 18,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: c.high,
    alignItems: "center",
    justifyContent: "center",
  },
  balance: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    backgroundColor: c.high,
    borderRadius: 99,
    padding: 10,
  },
  dock: {
    position: "absolute",
    bottom: 14,
    left: 16,
    right: 16,
    padding: 5,
    borderRadius: 99,
    backgroundColor: "#202522",
    flexDirection: "row",
    elevation: 8,
    boxShadow: "0 12px 30px #00000055",
  },
  tab: {
    flex: 1,
    minHeight: 52,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  preview: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  ongoing: {
    marginHorizontal: 16,
    padding: 10,
    backgroundColor: "#1b3028",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
  },
});
