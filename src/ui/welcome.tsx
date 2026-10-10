import { ScrollView, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AasaiTalkMark, Button, Card, Icon, T, go, type IconName } from "./components";
import { colors as c } from "./theme";

export function Welcome() {
  const inset = useSafeAreaInsets();
  const features: [IconName, string, string][] = [
    ["mic", "Talk instantly", "Audio and video"],
    ["shield", "Private by design", "Your number stays hidden"],
    ["heart", "Friendly community", "Connect at your pace"],
  ];
  return <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ flexGrow: 1, paddingBottom: inset.bottom + 10 }}>
    <View style={{ width: "100%", maxWidth: 560, alignSelf: "center", flexGrow: 1 }}>
      <View style={{ backgroundColor: c.mint, paddingTop: inset.top + 18, paddingHorizontal: 22, paddingBottom: 48, borderBottomLeftRadius: 34, borderBottomRightRadius: 34, overflow: "hidden", alignItems: "center" }}>
        <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
          {Array.from({ length: 64 }, (_, i) => <View key={i} style={{ position: "absolute", left: 0, right: 0, top: `${i * 100 / 64}%`, height: "1.7%", backgroundColor: `rgb(${255 - Math.round(i * 59 / 63)},${90 - Math.round(i * 48 / 63)},${95 - Math.round(i * 40 / 63)})` }} />)}
        </View>
        <View style={{ position: "absolute", width: 138, height: 138, borderRadius: 69, right: -46, top: -42, backgroundColor: "#ffffff1a" }} />
        <View style={{ position: "absolute", width: 96, height: 96, borderRadius: 48, left: -32, bottom: 18, backgroundColor: "#ffffff1a" }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><AasaiTalkMark size={32} /><T bold size={19} color="#fff">Aasai Talk</T></View>
        <View style={{ marginTop: 16, marginBottom: 10, padding: 3, borderRadius: 25, backgroundColor: "#ffffff55", boxShadow: "0 12px 24px rgba(0,0,0,0.18)" }}><AasaiTalkMark size={66} /></View>
        <T bold size={26} color="#fff" style={{ textAlign: "center", lineHeight: 30, letterSpacing: -0.6 }}>Meet. Talk.{"\n"}Feel connected.</T>
        <T size={14} color="#fff" style={{ textAlign: "center", marginTop: 7 }}>Real conversations, on your terms.</T>
      </View>
      <View style={{ paddingHorizontal: 18, marginTop: -20, flexGrow: 1, gap: 10 }}>
        <View style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: c.low, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 2, boxShadow: "0 8px 20px rgba(120,50,30,0.09)" }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.success }} /><T size={12} bold>People are talking now</T></View>
        <Card style={{ borderRadius: 22, padding: 8, gap: 2 }}>
          {features.map(([icon, title, detail]) => <View key={title} style={{ flexDirection: "row", alignItems: "center", gap: 11, padding: 9 }}><View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: c.high, alignItems: "center", justifyContent: "center" }}><Icon name={icon} color={c.mint} size={18} /></View><View style={{ flex: 1 }}><T size={14} bold>{title}</T><T size={12} color={c.secondary}>{detail}</T></View></View>)}
        </Card>
        <View style={{ marginTop: "auto", paddingTop: 8, gap: 2 }}><Button title="Continue with mobile" icon="arrow-right" onPress={() => go("/auth/login")} /><View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 4, paddingTop: 10, paddingHorizontal: 8 }}><T size={12} color={c.secondary}>By continuing, you agree to our</T><Pressable accessibilityRole="link" onPress={() => go("/settings/policies/terms")} hitSlop={8}><T size={12} bold color={c.mint} style={{ textDecorationLine: "underline" }}>Terms & Conditions</T></Pressable></View></View>
      </View>
    </View>
  </ScrollView>;
}
