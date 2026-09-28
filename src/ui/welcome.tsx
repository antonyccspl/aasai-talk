import { ScrollView, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AasaiTalkMark, Button, Card, Icon, T, go, type IconName } from "./components";
import { colors as c } from "./theme";

export function Welcome() {
  const inset = useSafeAreaInsets();
  const features: [IconName, string, string][] = [
    ["mic", "Instant 1-on-1 Audio", "Connect in seconds with real voices."],
    ["shield", "Safe & private", "Your number stays private."],
    ["heart", "Real people, real warmth", "Conversations at your pace."],
  ];
  return <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ flexGrow: 1, paddingBottom: inset.bottom + 10 }}>
    <View style={{ width: "100%", maxWidth: 560, alignSelf: "center", flexGrow: 1 }}>
      <View style={{ backgroundColor: c.mint, paddingTop: inset.top + 26, paddingHorizontal: 22, paddingBottom: 96, borderBottomLeftRadius: 42, borderBottomRightRadius: 42, overflow: "hidden", alignItems: "center" }}>
        <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
          {Array.from({ length: 64 }, (_, i) => <View key={i} style={{ position: "absolute", left: 0, right: 0, top: `${i * 100 / 64}%`, height: "1.7%", backgroundColor: `rgb(${255 - Math.round(i * 59 / 63)},${90 - Math.round(i * 48 / 63)},${95 - Math.round(i * 40 / 63)})` }} />)}
        </View>
        <View style={{ position: "absolute", width: 180, height: 180, borderRadius: 90, right: -60, top: -50, backgroundColor: "#ffffff1a" }} />
        <View style={{ position: "absolute", width: 120, height: 120, borderRadius: 60, left: -40, bottom: 30, backgroundColor: "#ffffff1a" }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><AasaiTalkMark size={32} /><T bold size={19} color="#fff">Aasai Talk</T></View>
        <View style={{ marginTop: 26, marginBottom: 16, padding: 3, borderRadius: 30, backgroundColor: "#ffffff55", boxShadow: "0 14px 30px rgba(0,0,0,0.22)" }}><AasaiTalkMark size={90} /></View>
        <T bold size={32} color="#fff" style={{ textAlign: "center", lineHeight: 36, letterSpacing: -0.9 }}>Meet people.{"\n"}Talk. Connect.</T>
        <T size={16} color="#fff" style={{ textAlign: "center", marginTop: 8 }}>Voice & video calls with real friends</T>
      </View>
      <View style={{ paddingHorizontal: 18, marginTop: -52, flexGrow: 1, gap: 10 }}>
        <View style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.low, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 9, marginBottom: 4, boxShadow: "0 8px 24px rgba(120,50,30,0.09)" }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.success }} /><T size={13} bold>People are talking now</T></View>
        {features.map(([icon, title, detail]) => <Card key={title} style={{ flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 16 }}><View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: c.high, alignItems: "center", justifyContent: "center" }}><Icon name={icon} color={c.mint} /></View><View style={{ flex: 1 }}><T size={15.5} bold>{title}</T><T size={13} color={c.secondary}>{detail}</T></View></Card>)}
        <View style={{ marginTop: "auto", paddingTop: 14 }}><Button title="Get Started" icon="arrow-right" onPress={() => go("/auth/login")} /><Pressable accessibilityRole="button" onPress={() => go("/auth/login")} style={{ paddingVertical: 12, alignItems: "center" }}><T size={13.5} color={c.secondary}>Already have an account? <T bold color={c.mint}>Log in</T></T></Pressable></View>
      </View>
    </View>
  </ScrollView>;
}
