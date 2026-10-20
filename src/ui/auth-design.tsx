import { Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold, useFonts } from "@expo-google-fonts/figtree";
import React, { createContext, useContext, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "./language";
import { colors as c } from "./theme";

export const authColors = { background: c.background, low: c.low, ink: c.text, muted: c.secondary, line: c.line, brand: c.mint };
const FontReady = createContext(false);
export function AuthText({ children, size = 14, bold = false, color = authColors.ink }: { children: React.ReactNode; size?: number; bold?: boolean; color?: string }) {
  const ready = useContext(FontReady);
  const { translate, usesIndicScript } = useLanguage();
  return <Text style={{ color, fontSize: size, lineHeight: size * 1.4, fontFamily: usesIndicScript ? undefined : ready ? (bold ? "Figtree_700Bold" : "Figtree_400Regular") : undefined, fontWeight: usesIndicScript ? undefined : ready ? undefined : bold ? "700" : "400" }}>{typeof children === "string" ? translate(children) : children}</Text>;
}

export function AuthButton({ title, onPress, disabled, loading, variant }: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: "secondary"; icon?: string }) {
  const unavailable = disabled || loading;
  const color = variant === "secondary" ? authColors.brand : "#fff";
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!unavailable, busy: !!loading }} disabled={unavailable} onPress={onPress} style={({ pressed }) => [styles.button, variant === "secondary" && styles.secondary, { opacity: unavailable ? 0.5 : pressed ? 0.8 : 1 }]}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {loading && <ActivityIndicator size="small" color={color} />}
      <AuthText size={variant === "secondary" ? 15 : 17} bold color={color}>{title}</AuthText>
    </View>
  </Pressable>;
}

export function AuthField({ label, value, onChange, error, placeholder }: { label?: string; value: string; onChange: (value: string) => void; error?: string; numeric?: boolean; placeholder?: string }) {
  const [focused, setFocused] = useState(false);
  const ready = useContext(FontReady);
  const { translate, usesIndicScript } = useLanguage();
  return <View style={styles.fieldGroup}>
    {!!label && <AuthText size={13} bold color={authColors.muted}>{label}</AuthText>}
    <View style={[styles.field, { borderColor: focused || error ? authColors.brand : authColors.line, backgroundColor: focused ? "#fff" : authColors.background }]}>
      <View style={styles.country}><Text style={{ fontSize: 19 }}>🇮🇳</Text><AuthText size={15} bold>+91</AuthText></View>
      <TextInput accessibilityLabel={translate("Mobile number")} value={value} onChangeText={onChange} keyboardType="phone-pad" autoComplete="tel-national" maxLength={10} placeholder={translate(placeholder || "Enter mobile number")} placeholderTextColor="#96908b" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[{ flex: 1, minWidth: 0, height: "100%", padding: 0, color: authColors.ink, fontSize: 16, textAlignVertical: "center", includeFontPadding: false, fontFamily: usesIndicScript ? undefined : ready ? "Figtree_600SemiBold" : undefined }, Platform.OS === "web" ? ({ outlineStyle: "none", outlineWidth: 0, outlineColor: "transparent" } as never) : undefined]} />
      {value.length === 10 && <View style={styles.check}><AuthText bold color="#fff">✓</AuthText></View>}
    </View>
    {!!error && <View accessibilityRole="alert" style={{ marginTop: 8 }}><AuthText size={12} color={authColors.brand}>{error}</AuthText></View>}
  </View>;
}

export function AuthFrame({ children, otp, phone }: { children: React.ReactNode; otp: boolean; phone: string }) {
  const inset = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height - inset.top - inset.bottom < 780;
  const [ready] = useFonts({ Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold });
  return <FontReady.Provider value={ready}><KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "android" ? 24 : 0}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(inset.bottom, 10) }}>
      <View style={styles.container}>
        <View style={[styles.hero, { paddingTop: inset.top + (compact ? 8 : 16), paddingBottom: compact ? 22 : 34 }]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {Array.from({ length: 64 }, (_, i) => { const t = i / 63; return <View key={i} style={{ position: "absolute", left: 0, right: 0, top: `${i * 100 / 64}%`, height: "1.7%", backgroundColor: `rgb(${Math.round(124 + 52 * t)},${Math.round(48 - t)},${Math.round(66 + 4 * t)})` }} />; })}
          </View>
          <View style={styles.logo}><View style={styles.logoIcon}><Text style={{ fontSize: 18 }}>📞</Text></View><AuthText size={20} bold color="#fff">Aasai Talk</AuthText></View>
          <View style={[styles.bubbles, compact && styles.compactBubbles]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[{ emoji: "😄", left: "10%", top: 16, size: 46, color: "#ffe1a8" }, { emoji: "🧑‍🎤", left: "35%", top: 0, size: 58, color: "#c9f2df" }, { emoji: "👩‍🦱", left: "61%", top: 18, size: 46, color: "#ffd0d6" }, { emoji: "🎧", left: "79%", top: 2, size: 40, color: "#d8dcff" }].map((a) => <View key={a.emoji} style={[styles.avatar, { left: a.left as `${number}%`, top: a.top, width: a.size, height: a.size, backgroundColor: a.color }]}><Text style={{ fontSize: Math.min(a.size * 0.42, 26) }}>{a.emoji}</Text></View>)}
            <View style={styles.pill}><View style={styles.dot} /><AuthText size={11} bold>Private number. Real connections.</AuthText></View>
          </View>
          <AuthText size={compact ? 23 : 25} bold color="#fff">Talk. Laugh.{"\n"}Feel connected.</AuthText>
          <AuthText size={13.5} color="#fff">Friendly conversations, whenever you want them.</AuthText>
        </View>
        <View style={[styles.card, compact && styles.compactCard]}>
          <View style={{ gap: 4, marginBottom: 6 }}><AuthText size={19} bold>{otp ? "Enter verification code" : "Log in or sign up"}</AuthText><AuthText size={13.5} color={authColors.muted}>{otp ? `Enter the six-digit code for ${phone}` : "Continue with your mobile number"}</AuthText></View>
          {children}
        </View>
        <View style={styles.trust}>{[["🔒", "Your number\nstays private"], ["🛡️", "Connect with\nconfidence"], ["🎉", "Meet new\nfriends"]].map(([emoji, label]) => <View key={emoji} style={{ flex: 1, alignItems: "center", gap: 4 }}><Text style={{ fontSize: 20 }}>{emoji}</Text><View style={{ alignItems: "center" }}><AuthText size={12} bold color={authColors.muted}>{label}</AuthText></View></View>)}</View>
        <View style={styles.footer}><AuthText size={12} color={authColors.muted}>Made for friendly conversations. 18+ only.</AuthText></View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView></FontReady.Provider>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: authColors.background },
  container: { width: "100%", maxWidth: 430, alignSelf: "center", flexGrow: 1 },
  hero: { backgroundColor: authColors.brand, paddingHorizontal: 22, paddingBottom: 34, overflow: "hidden", shadowColor: "#241923", shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  logo: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#48243f", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  bubbles: { height: 70, marginTop: 10, marginBottom: 2 },
  compactBubbles: { height: 48, marginTop: 7, marginBottom: 0 },
  avatar: { position: "absolute", borderRadius: 99, borderWidth: 3, borderColor: "#ffffffeb", alignItems: "center", justifyContent: "center", overflow: "hidden", elevation: 5 },
  pill: { position: "absolute", bottom: -5, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", paddingVertical: 7, paddingHorizontal: 12, borderRadius: 99, elevation: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3ecf8e" },
  card: { marginHorizontal: 22, borderWidth: 1, borderColor: authColors.line, borderRadius: 20, backgroundColor: authColors.low, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16, gap: 12, shadowColor: "#281a21", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  compactCard: { marginHorizontal: 16, paddingHorizontal: 14, paddingTop: 15, paddingBottom: 12, gap: 10 },
  fieldGroup: { gap: 7 },
  field: { flexDirection: "row", alignItems: "center", height: 58, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, gap: 12 },
  country: { minWidth: 76, height: 30, flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingRight: 12, borderRightWidth: 1, borderColor: authColors.line },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#3ecf8e", alignItems: "center", justifyContent: "center" },
  button: { minHeight: 52, borderRadius: 14, backgroundColor: authColors.brand, alignItems: "center", justifyContent: "center", padding: 12, shadowColor: "#48243f", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  secondary: { minHeight: 44, backgroundColor: "#fff", borderWidth: 1.5, borderColor: authColors.line, shadowColor: "#281a21", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  trust: { flexDirection: "row", marginHorizontal: 24, marginTop: 12, gap: 8 },
  footer: { alignItems: "center", marginTop: 8, padding: 10 },
});
