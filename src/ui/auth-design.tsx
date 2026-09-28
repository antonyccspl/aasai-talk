import React, { createContext, useContext, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts, Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold } from "@expo-google-fonts/figtree";

export const authColors = { background: "#fff8f3", ink: "#1c1c1c", muted: "#6b6b6b", line: "#eadfd6", brand: "#e23744" };
const FontReady = createContext(false);
export function AuthText({ children, size = 14, bold = false, color = authColors.ink }: { children: React.ReactNode; size?: number; bold?: boolean; color?: string }) {
  const ready = useContext(FontReady);
  return <Text style={{ color, fontSize: size, lineHeight: size * 1.4, fontFamily: ready ? (bold ? "Figtree_700Bold" : "Figtree_400Regular") : undefined, fontWeight: ready ? undefined : bold ? "700" : "400" }}>{children}</Text>;
}

export function AuthButton({ title, onPress, disabled, variant }: { title: string; onPress: () => void; disabled?: boolean; variant?: "secondary"; icon?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, variant === "secondary" && styles.secondary, { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}>
    <AuthText size={variant === "secondary" ? 15 : 17} bold color={variant === "secondary" ? authColors.brand : "#fff"}>{title}</AuthText>
  </Pressable>;
}

export function AuthField({ value, onChange, error }: { label?: string; value: string; onChange: (value: string) => void; error?: string; numeric?: boolean; placeholder?: string }) {
  const [focused, setFocused] = useState(false);
  const ready = useContext(FontReady);
  return <View>
    <View style={[styles.field, { borderColor: focused || error ? authColors.brand : authColors.line }]}>
      <View style={styles.country}><AuthText size={16} bold>🇮🇳 +91</AuthText></View>
      <TextInput accessibilityLabel="Mobile number" value={value} onChangeText={onChange} keyboardType="phone-pad" autoComplete="tel-national" maxLength={10} placeholder="Enter mobile number" placeholderTextColor="#96908b" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ flex: 1, minWidth: 0, padding: 0, color: authColors.ink, fontSize: 16, fontFamily: ready ? "Figtree_600SemiBold" : undefined }} />
      {value.length === 10 && <View style={styles.check}><AuthText bold color="#fff">✓</AuthText></View>}
    </View>
    {!!error && <View accessibilityRole="alert" style={{ marginTop: 8 }}><AuthText size={12} color={authColors.brand}>{error}</AuthText></View>}
  </View>;
}

export function AuthFrame({ children, otp, phone }: { children: React.ReactNode; otp: boolean; phone: string }) {
  const inset = useSafeAreaInsets();
  const [ready] = useFonts({ Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold });
  return <FontReady.Provider value={ready}><KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: inset.bottom }}>
      <View style={styles.container}>
        <View style={[styles.hero, { paddingTop: inset.top + 22 }]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {Array.from({ length: 64 }, (_, i) => { const t = i / 63; return <View key={i} style={{ position: "absolute", left: 0, right: 0, top: `${i * 100 / 64}%`, height: "1.7%", backgroundColor: `rgb(${Math.round(255 - 54 * t)},${Math.round(90 - 48 * t)},${Math.round(95 - 40 * t)})` }} />; })}
          </View>
          <View style={styles.logo}><View style={styles.logoIcon}><Text style={{ fontSize: 18 }}>📞</Text></View><AuthText size={20} bold color="#fff">Aasai Talk</AuthText></View>
          <View style={styles.bubbles} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[{ emoji: "😄", left: "6%", top: 18, size: 64, color: "#ffe1a8" }, { emoji: "🧑‍🎤", left: "32%", top: 0, size: 78, color: "#c9f2df" }, { emoji: "👩‍🦱", left: "64%", top: 22, size: 64, color: "#ffd0d6" }, { emoji: "🎧", left: "85%", top: -6, size: 52, color: "#d8dcff" }].map((a) => <View key={a.emoji} style={[styles.avatar, { left: a.left as `${number}%`, top: a.top, width: a.size, height: a.size, backgroundColor: a.color }]}><Text style={{ fontSize: a.size * 0.48 }}>{a.emoji}</Text></View>)}
            <View style={styles.pill}><View style={styles.dot} /><AuthText size={12} bold>A new friendship starts here</AuthText></View>
          </View>
          <Text style={{ color: "#fff", fontSize: 30, lineHeight: 35, letterSpacing: -0.9, marginTop: 18, marginBottom: 8, fontFamily: ready ? "Figtree_800ExtraBold" : undefined, fontWeight: ready ? undefined : "800" }}>Talk. Laugh.{"\n"}Make a new friend.</Text>
          <AuthText size={15} color="#fff">Voice call with friendly people, anytime you feel like chatting.</AuthText>
        </View>
        <View style={styles.card}>
          <View style={{ gap: 4, marginBottom: 6 }}><AuthText size={19} bold>{otp ? "Enter verification code" : "Log in or sign up"}</AuthText><AuthText size={13.5} color={authColors.muted}>{otp ? `Enter the six-digit code for ${phone}` : "Continue with your mobile number"}</AuthText></View>
          {children}
        </View>
        <View style={styles.trust}>{[["🔒", "Your number\nstays private"], ["🛡️", "Connect with\nconfidence"], ["🎉", "Meet new\nfriends"]].map(([emoji, label]) => <View key={emoji} style={{ flex: 1, alignItems: "center", gap: 4 }}><Text style={{ fontSize: 20 }}>{emoji}</Text><Text style={{ textAlign: "center", color: authColors.muted, fontSize: 12, lineHeight: 16, fontFamily: ready ? "Figtree_600SemiBold" : undefined }}>{label}</Text></View>)}</View>
        <View style={styles.footer}><AuthText size={12} color={authColors.muted}>Made for friendly conversations. 18+ only.</AuthText></View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView></FontReady.Provider>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: authColors.background },
  container: { width: "100%", maxWidth: 430, alignSelf: "center", flexGrow: 1 },
  hero: { backgroundColor: authColors.brand, paddingHorizontal: 22, paddingBottom: 86, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: "hidden" },
  logo: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  bubbles: { height: 120, marginTop: 22, marginBottom: 6 },
  avatar: { position: "absolute", borderRadius: 99, borderWidth: 3, borderColor: "#ffffffeb", alignItems: "center", justifyContent: "center", elevation: 5 },
  pill: { position: "absolute", bottom: -6, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, elevation: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3ecf8e" },
  card: { marginTop: -58, marginHorizontal: 18, backgroundColor: "#fff", borderRadius: 28, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 20, gap: 14, boxShadow: "0 10px 30px rgba(226,55,68,0.14)" },
  field: { flexDirection: "row", alignItems: "center", height: 58, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 14, gap: 10, backgroundColor: authColors.background },
  country: { paddingRight: 10, borderRightWidth: 1.5, borderColor: authColors.line },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#3ecf8e", alignItems: "center", justifyContent: "center" },
  button: { minHeight: 56, borderRadius: 18, backgroundColor: authColors.brand, alignItems: "center", justifyContent: "center", padding: 12, boxShadow: "0 8px 20px rgba(226,55,68,0.22)" },
  secondary: { minHeight: 48, backgroundColor: "#fff", borderWidth: 1.5, borderColor: authColors.line, boxShadow: "none" },
  trust: { flexDirection: "row", marginHorizontal: 18, marginTop: 22, gap: 8 },
  footer: { alignItems: "center", marginTop: "auto", padding: 22 },
});
