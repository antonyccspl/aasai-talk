import { Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold, useFonts } from "@expo-google-fonts/figtree";
import React, { createContext, useContext, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "./language";

export const authColors = { background: "#fff8f3", ink: "#1c1c1c", muted: "#6b6b6b", line: "#eadfd6", brand: "#e23744" };
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

export function AuthField({ value, onChange, error }: { label?: string; value: string; onChange: (value: string) => void; error?: string; numeric?: boolean; placeholder?: string }) {
  const [focused, setFocused] = useState(false);
  const ready = useContext(FontReady);
  const { translate, usesIndicScript } = useLanguage();
  return <View>
    <View style={[styles.field, { borderColor: focused || error ? authColors.brand : authColors.line }]}>
      <View style={styles.country}><AuthText size={16} bold>🇮🇳 +91</AuthText></View>
      <TextInput accessibilityLabel={translate("Mobile number")} value={value} onChangeText={onChange} keyboardType="phone-pad" autoComplete="tel-national" maxLength={10} placeholder={translate("Enter mobile number")} placeholderTextColor="#96908b" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ flex: 1, minWidth: 0, padding: 0, color: authColors.ink, fontSize: 16, fontFamily: usesIndicScript ? undefined : ready ? "Figtree_600SemiBold" : undefined }} />
      {value.length === 10 && <View style={styles.check}><AuthText bold color="#fff">✓</AuthText></View>}
    </View>
    {!!error && <View accessibilityRole="alert" style={{ marginTop: 8 }}><AuthText size={12} color={authColors.brand}>{error}</AuthText></View>}
  </View>;
}

export function AuthFrame({ children, otp, phone }: { children: React.ReactNode; otp: boolean; phone: string }) {
  const inset = useSafeAreaInsets();
  const [ready] = useFonts({ Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold });
  return <FontReady.Provider value={ready}><KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(inset.bottom, 10) }}>
      <View style={styles.container}>
        <View style={[styles.hero, { paddingTop: inset.top + 16 }]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {Array.from({ length: 64 }, (_, i) => { const t = i / 63; return <View key={i} style={{ position: "absolute", left: 0, right: 0, top: `${i * 100 / 64}%`, height: "1.7%", backgroundColor: `rgb(${Math.round(255 - 54 * t)},${Math.round(90 - 48 * t)},${Math.round(95 - 40 * t)})` }} />; })}
          </View>
          <View style={styles.logo}><View style={styles.logoIcon}><Text style={{ fontSize: 18 }}>📞</Text></View><AuthText size={20} bold color="#fff">Aasai Talk</AuthText></View>
          <View style={styles.bubbles} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[{ emoji: "😄", left: "10%", top: 16, size: 46, color: "#ffe1a8" }, { emoji: "🧑‍🎤", left: "35%", top: 0, size: 58, color: "#c9f2df" }, { emoji: "👩‍🦱", left: "61%", top: 18, size: 46, color: "#ffd0d6" }, { emoji: "🎧", left: "79%", top: 2, size: 40, color: "#d8dcff" }].map((a) => <View key={a.emoji} style={[styles.avatar, { left: a.left as `${number}%`, top: a.top, width: a.size, height: a.size, backgroundColor: a.color }]}><Text style={{ fontSize: Math.min(a.size * 0.42, 26) }}>{a.emoji}</Text></View>)}
            <View style={styles.pill}><View style={styles.dot} /><AuthText size={11} bold>Private number. Real connections.</AuthText></View>
          </View>
          <AuthText size={25} bold color="#fff">Talk. Laugh.{"\n"}Feel connected.</AuthText>
          <AuthText size={13.5} color="#fff">Friendly conversations, whenever you want them.</AuthText>
        </View>
        <View style={styles.card}>
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
  hero: { backgroundColor: authColors.brand, paddingHorizontal: 22, paddingBottom: 38, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: "hidden" },
  logo: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  bubbles: { height: 70, marginTop: 10, marginBottom: 2 },
  avatar: { position: "absolute", borderRadius: 99, borderWidth: 3, borderColor: "#ffffffeb", alignItems: "center", justifyContent: "center", overflow: "hidden", elevation: 5 },
  pill: { position: "absolute", bottom: -5, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", paddingVertical: 7, paddingHorizontal: 12, borderRadius: 99, elevation: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3ecf8e" },
  card: { marginTop: -22, marginHorizontal: 18, backgroundColor: "#fff", borderRadius: 22, paddingHorizontal: 18, paddingTop: 17, paddingBottom: 16, gap: 10, boxShadow: "0 10px 30px rgba(226,55,68,0.14)" },
  field: { flexDirection: "row", alignItems: "center", height: 54, borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14, gap: 10, backgroundColor: authColors.background },
  country: { paddingRight: 10, borderRightWidth: 1.5, borderColor: authColors.line },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#3ecf8e", alignItems: "center", justifyContent: "center" },
  button: { minHeight: 52, borderRadius: 16, backgroundColor: authColors.brand, alignItems: "center", justifyContent: "center", padding: 12, boxShadow: "0 8px 20px rgba(226,55,68,0.22)" },
  secondary: { minHeight: 44, backgroundColor: "#fff", borderWidth: 1.5, borderColor: authColors.line, boxShadow: "none" },
  trust: { flexDirection: "row", marginHorizontal: 24, marginTop: 12, gap: 8 },
  footer: { alignItems: "center", marginTop: 8, padding: 10 },
});
