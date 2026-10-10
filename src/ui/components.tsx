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
    Vibration,
    ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandGradient } from "./brand-gradient";
import { useLanguage } from "./language";
import {
    coins,
    duration,
    getEffectivePresenceStatus,
    Person,
    personFor,
    talkTime,
    useDemo,
} from "./store";
import { colors as c, fonts } from "./theme";
export type IconName = React.ComponentProps<typeof Feather>["name"];
export const go = (path: string) => router.push(path as never);
/** Return to the screen the member actually came from, with a safe fallback for direct links. */
export const back = (fallback = "/explore") => {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback as never);
};
/** Brief native acknowledgement for deliberate controls; web keeps visual feedback only. */
const pressFeedback = () => {
  if (Platform.OS !== "web") Vibration.vibrate(8);
};
export function presenceText(status: string) {
  if (status === "Available") return "Available";
  if (status === "Busy") return "On a call";
  return "Away";
}
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
  const { translate, usesIndicScript } = useLanguage();
  const displayedChildren = typeof children === "string" ? translate(children) : children;
  return (
    <Text
      {...rest}
      style={[
        {
          // Figtree does not contain Tamil glyphs; use the platform's Indic font
          // fallback for Tamil while retaining the existing brand typeface in English.
          fontFamily: usesIndicScript ? undefined : mono ? fonts.mono : bold ? fonts.bold : fonts.regular,
          fontSize: size,
          lineHeight: size * 1.45,
          color,
        },
        style,
      ]}
    >
      {displayedChildren}
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
export function DiamondMark({ size = 14, color = "#5de6e7" }: { size?: number; color?: string }) {
  return (
    <FontAwesome6
      name="gem"
      size={size}
      color={color}
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
      onPress={() => {
        pressFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor:
            variant === "primary"
              ? c.mint
              : variant === "danger"
                ? c.danger
                : c.low,
          borderWidth: variant === "secondary" ? 1.5 : 0,
          borderColor: c.line,
          boxShadow: variant === "primary" ? "0 8px 20px rgba(226,55,68,0.20)" : "none",
          opacity: disabled ? 0.4 : pressed ? 0.72 : 1,
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {variant === "primary" && <BrandGradient />}
      {icon && <Icon name={icon} color={color} size={20} />}
      <T bold size={16} color={color} style={{ flexShrink: 1, textAlign: "center" }}>
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
      onPress={() => {
        pressFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        s.iconButton,
        {
          opacity: pressed ? 0.6 : 1,
          backgroundColor: danger ? c.danger : active ? c.mint : c.low,
          borderWidth: 1.5,
          borderColor: c.line,
          transform: [{ scale: pressed ? 0.94 : 1 }],
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
          backgroundColor: selected ? c.text : onPress ? c.low : c.high,
          borderWidth: onPress ? 1.5 : 0,
          borderColor: selected ? c.text : c.line,
          minHeight: onPress ? 40 : 24,
        },
      ]}
    >
      <T size={onPress ? 13.5 : 12.5} mono color={selected ? c.ink : c.secondary}>
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
  // Local file URIs are allowed only inside PhotoPicker while a person is
  // choosing an image. Everywhere else, render solely a server-approved URL.
  const approvedAvatarUri =
    avatarUri && /^https:\/\//i.test(avatarUri) ? avatarUri : undefined;
  // When this is the signed-in user's avatar there is no `person` object.
  // Use the saved profile name so a profile edit is reflected immediately.
  const avatarName = person?.name || name || profile.name || "M";
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [approvedAvatarUri]);
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
      {approvedAvatarUri && !failed ? (
        <Image
          source={{ uri: approvedAvatarUri }}
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
          backgroundColor: warning ? c.warning : c.success,
        }}
      />
      <T mono size={11} color={warning ? c.warning : c.success}>
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
  const [focused, setFocused] = useState(false);
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          s.input,
          {
            minHeight: multiline ? 92 : 58,
            borderColor: error ? c.error : focused ? c.mint : c.line,
            backgroundColor: c.surface,
            color: c.text,
            boxShadow: focused ? "0 0 0 3px rgba(226,55,68,0.10)" : "none",
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
      <T size={17} bold numberOfLines={2} style={{ flex: 1, flexShrink: 1 }}>
        {title}
      </T>
      {action && (
        <Pressable
          onPress={onPress}
          accessibilityLabel={action}
          accessibilityRole="button"
          style={{
            minHeight: 42,
            minWidth: actionIcon ? 42 : undefined,
            paddingHorizontal: actionIcon ? 0 : 10,
            borderRadius: 15,
            backgroundColor: c.high,
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
      style={({ pressed }) => [
        s.setting,
        {
          backgroundColor: pressed && onPress ? c.surface : c.low,
          transform: [{ scale: pressed && onPress ? 0.992 : 1 }],
        },
      ]}
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
        borderWidth: 1,
        borderColor: error ? "#f7c8cc" : c.line,
        borderLeftWidth: 4,
        borderLeftColor: error ? c.error : c.mint,
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
/** Lightweight placeholders for network-backed lists. */
export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <View accessibilityLabel="Loading content" style={{ gap: 12 }}>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={{
            minHeight: 82,
            padding: 15,
            gap: 10,
            borderRadius: 20,
            backgroundColor: c.low,
            borderWidth: 1,
            borderColor: c.line,
          }}
        >
          <View style={{ width: index % 2 ? "48%" : "64%", height: 13, borderRadius: 7, backgroundColor: c.high }} />
          <View style={{ width: "82%", height: 10, borderRadius: 5, backgroundColor: c.high }} />
          <View style={{ width: "34%", height: 10, borderRadius: 5, backgroundColor: c.high }} />
        </View>
      ))}
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
export function UserCard({ person, grid = false, index = 0 }: { person: Person; grid?: boolean; index?: number }) {
  const d = useDemo();
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const showPhoto = Boolean(person.photo && failedPhoto !== person.photo);
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
  const effectiveStatus = getEffectivePresenceStatus(person, {
    active: d.active,
    available: person.status !== "Offline" || d.available,
  });
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
    effectiveStatus === "Available"
      ? c.success
      : effectiveStatus === "Busy"
        ? c.warning
        : c.error;
  const presenceLabel = presenceText(effectiveStatus);
  if (grid) {
    const backgrounds = ["#c73543", "#6046c2", "#127e79", "#b95422"];
    const available = effectiveStatus === "Available";
    return <View style={{ width: "48%", flexGrow: 1, minHeight: 224, borderRadius: 26, padding: 14, overflow: "hidden", backgroundColor: backgrounds[index % backgrounds.length], justifyContent: "flex-end" }}>
      <View pointerEvents="none" style={{ position: "absolute", width: 190, height: 190, borderRadius: 95, top: -70, right: -50, backgroundColor: "#ffffff15" }} />
      {showPhoto ? <>
        <Image source={{ uri: person.photo }} resizeMode="cover" accessibilityLabel={`${person.name} profile photo`} style={StyleSheet.absoluteFill} onError={() => setFailedPhoto(person.photo ?? null)} />
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 112, backgroundColor: "rgba(0,0,0,0.65)" }} />
      </> : <T bold size={58} color="#ffffff55" style={{ position: "absolute", top: 34, left: 0, right: 0, textAlign: "center" }}>{person.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</T>}
      <View style={{ position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 99, backgroundColor: "#00000047", paddingHorizontal: 10, paddingVertical: 5 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: available ? "#5dffb0" : statusColor }} /><T size={11} bold color="#fff">{presenceText(effectiveStatus)}</T></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${person.name}`} onPress={() => go(`/user/${person.id}`)} style={{ paddingTop: 100, paddingBottom: 10 }}>
        <T size={16.5} bold color="#fff" numberOfLines={1}>{person.name}, {person.age}</T>
        <T size={12} color="#fff" numberOfLines={1}>{person.city} · {person.languages[0]}</T>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 7 }}>
        {(["audio", "video"] as const).map((type) => <Pressable key={type} accessibilityRole="button" accessibilityLabel={`${type} call with ${person.name}`} accessibilityState={{ disabled: !available }} disabled={!available} onPress={() => go(`/calls/outgoing/${person.id}?type=${type}`)} style={{ flex: 1, minHeight: 38, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: type === "audio" ? "#fff" : "#ffffff40", opacity: available ? 1 : 0.5 }}>
          <Icon name={type === "audio" ? "phone" : "video"} size={15} color={type === "audio" ? c.danger : "#fff"} />
          <DiamondMark size={10} color={type === "audio" ? c.danger : "#fff"} />
          <T size={11} bold color={type === "audio" ? c.danger : "#fff"}>{slabsLoading ? "…" : (type === "audio" ? audioRate : videoRate) === undefined ? "—" : `${type === "audio" ? audioRate : videoRate}/min`}</T>
        </Pressable>)}
      </View>
    </View>;
  }
  return (
    <Card style={{ position: "relative" }}>
      <Animated.View
        accessibilityLabel={`${effectiveStatus} presence`}
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
          <Avatar person={person} size={72} square />
          <View style={{ flex: 1, gap: 3 }}>
            <T bold size={18}>
              {person.name}, {person.age}
            </T>
            <T size={12} color={c.secondary}>
              {person.city} · {person.languages.join(" · ")}
            </T>
          </View>
        </Row>
      </Pressable>
      <Row style={{ gap: 6 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
        <T mono size={10} color={statusColor}>{presenceLabel}</T>
      </Row>
      <Row style={{ flexWrap: "wrap", gap: 6 }}>
        {person.interests.map((x) => (
          <Chip key={x} title={x} />
        ))}
      </Row>
      {effectiveStatus === "Available" ? (
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
                minHeight: 54,
                borderRadius: 18,
                backgroundColor: c.mint,
              },
            ]}
          >
            <BrandGradient />
            <Row style={{ gap: 5, justifyContent: "center" }}>
              <Icon name="phone" size={17} color={c.ink} />
              <T bold size={12} color={c.ink}>
                Audio
              </T>
              <DiamondMark size={9} color={c.ink} />
              <T mono size={10} color={c.ink}>
                {slabsLoading
                  ? "…"
                  : audioRate === undefined
                    ? "—"
                    : `${audioRate} diamonds/min`}
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
                minHeight: 54,
                borderRadius: 18,
                backgroundColor: c.low,
                borderWidth: 1.5,
                borderColor: c.mint,
              },
            ]}
          >
            <Row style={{ gap: 5, justifyContent: "center" }}>
              <Icon name="video" size={17} color={c.mint} />
              <T bold size={12} color={c.mint}>
                Video
              </T>
              <DiamondMark size={9} color={c.mint} />
              <T mono size={10} color={c.mint}>
                {slabsLoading
                  ? "…"
                  : videoRate === undefined
                    ? "—"
                    : `${videoRate} diamonds/min`}
              </T>
            </Row>
          </Pressable>
        </Row>
      ) : (
        <Row>
          <View style={[s.button, { flex: 1, backgroundColor: c.high }]}>
            <Icon
              name={effectiveStatus === "Busy" ? "phone-off" : "slash"}
              size={18}
              color={statusColor}
            />
            <T bold color={statusColor}>
              {effectiveStatus === "Busy" ? "Busy on another call" : "Offline"}
            </T>
          </View>
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
  stickyContentHeader,
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
  /** Content that remains visible above a scrolling conversation. */
  stickyContentHeader?: React.ReactNode;
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
  const viewportWidth = useWindowDimensions().width;
  const compact = viewportWidth < 400;
  const wideWebLayout = Platform.OS === "web" && viewportWidth >= 768;
  const frameMaxWidth = Platform.OS === "web"
    ? Math.min(960, Math.max(430, viewportWidth - 48))
    : 430;
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
        <View style={[s.frame, { backgroundColor: c.background, maxWidth: frameMaxWidth }]}>
          <Row style={s.header}>
            {title ? (
              <>
                <IconButton
                  icon="arrow-left"
                  label="Go back"
                  onPress={() =>
                    back(title === "Create your profile" ? "/auth/login" : "/explore")
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
                {d.paid && !isApprovedHost && !title && (
                  <Pressable
                    onPress={() => go("/wallet")}
                    style={[
                      s.balance,
                      {
                        backgroundColor: c.high,
                        borderColor: c.line,
                        padding: compact ? 8 : 10,
                      },
                    ]}
                    accessibilityLabel={`Open wallet. Available balance: ${coins(d.balance)}`}
                  >
                    <CoinStack size={compact ? 18 : 21} />
                    <T mono size={compact ? 10 : 12}>
                      {compact ? d.balance.toLocaleString("en-IN") : coins(d.balance)}
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
          {stickyContentHeader && (
            <View
              style={{
                paddingHorizontal: 20,
                paddingVertical: 12,
                backgroundColor: c.background,
                borderBottomWidth: 1,
                borderBottomColor: c.line,
              }}
            >
              {stickyContentHeader}
            </View>
          )}
          {scroll ? (
              <ScrollView
              ref={scrollRef}
                style={{ flex: 1, minHeight: 0 }}
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
                { flexGrow: 1, paddingBottom: tab ? 112 : 28 },
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
            <View
              style={[
                s.dock,
                { backgroundColor: c.low },
                wideWebLayout && {
                  left: "50%",
                  right: undefined,
                  width: 560,
                  transform: [{ translateX: -280 }],
                },
              ]}
            >
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
                  <T mono size={11.5} color={tab === name ? c.mint : c.secondary}>
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
  safe: { flex: 1, minHeight: 0, backgroundColor: c.background },
  frame: { flex: 1, minHeight: 0, width: "100%", maxWidth: 430, alignSelf: "center" },
  header: { minHeight: 76, paddingHorizontal: 20, gap: 8, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: "rgba(240,224,214,0.72)" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  content: { padding: 20, gap: 18 },
  card: { backgroundColor: c.low, borderRadius: 24, borderWidth: 1, borderColor: c.line, padding: 17, gap: 14, boxShadow: "0 10px 26px rgba(97,47,28,0.075)" },
  button: {
    overflow: "hidden",
    minHeight: 56,
    borderRadius: 18,
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
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 99,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: c.text,
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderRadius: 18,
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
    borderWidth: 1,
    borderColor: c.line,
    boxShadow: "0 8px 18px rgba(97,47,28,0.055)",
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
    padding: 8,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.low,
    flexDirection: "row",
    elevation: 8,
    boxShadow: "0 14px 32px rgba(80,30,20,0.18)",
  },
  tab: {
    overflow: "hidden",
    flex: 1,
    minHeight: 56,
    borderRadius: 20,
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
