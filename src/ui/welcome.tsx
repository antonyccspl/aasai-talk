import {
  ScrollView,
  View,
  Pressable,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AasaiTalkMark,
  Button,
  Card,
  Icon,
  T,
  go,
  type IconName,
} from "./components";
import { colors as c } from "./theme";

export function Welcome() {
  const inset = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const wideWeb = Platform.OS === "web" && viewportWidth >= 900;
  const compact = viewportWidth < 380;
  const features: [IconName, string, string][] = [
    ["mic", "Talk instantly", "Audio and video"],
    ["shield", "Private by design", "Your number stays hidden"],
    ["heart", "Friendly community", "Connect at your pace"],
  ];
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: wideWeb ? "center" : undefined,
        paddingHorizontal: wideWeb ? 28 : 0,
        paddingVertical: wideWeb ? 34 : 0,
        paddingBottom: inset.bottom + (wideWeb ? 34 : 10),
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: wideWeb ? 1040 : 560,
          alignSelf: "center",
          flexGrow: 1,
          minHeight: wideWeb ? 550 : undefined,
          flexDirection: wideWeb ? "row" : "column",
        }}
      >
        <View
          style={{
            flex: wideWeb ? 1.12 : undefined,
            minHeight: wideWeb ? 550 : undefined,
            backgroundColor: c.mint,
            paddingTop: wideWeb ? 40 : inset.top + 18,
            paddingHorizontal: wideWeb ? 42 : compact ? 18 : 22,
            paddingBottom: wideWeb ? 40 : 48,
            borderRadius: wideWeb ? 34 : undefined,
            borderBottomLeftRadius: 34,
            borderBottomRightRadius: 34,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: wideWeb ? "center" : undefined,
            shadowColor: c.deep,
            shadowOpacity: 0.2,
            shadowRadius: wideWeb ? 34 : 28,
            shadowOffset: { width: 0, height: 14 },
            elevation: 8,
            ...(wideWeb
              ? { boxShadow: "0 24px 64px rgba(40, 26, 33, 0.22)" }
              : {}),
          }}
        >
          <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
            {Array.from({ length: 64 }, (_, i) => {
              const t = i / 63;
              return (
                <View
                  key={i}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: `${(i * 100) / 64}%`,
                    height: "1.7%",
                    backgroundColor: `rgb(${Math.round(124 + 52 * t)},${Math.round(48 - t)},${Math.round(66 + 4 * t)})`,
                  }}
                />
              );
            })}
          </View>
          <View
            style={{
              position: "absolute",
              width: 138,
              height: 138,
              borderRadius: 69,
              right: -46,
              top: -42,
              backgroundColor: "#ffffff1a",
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 96,
              height: 96,
              borderRadius: 48,
              left: -32,
              bottom: 18,
              backgroundColor: "#ffffff1a",
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <AasaiTalkMark size={32} />
            <T bold size={19} color="#fff">
              Aasai Talk
            </T>
          </View>
          <View
            style={{
              marginTop: wideWeb ? 22 : 16,
              marginBottom: 12,
              padding: 4,
              borderRadius: 28,
              backgroundColor: "#ffffff55",
              shadowColor: c.deep,
              shadowOpacity: 0.24,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: 12 },
              elevation: 6,
            }}
          >
            <AasaiTalkMark size={wideWeb ? 78 : 66} />
          </View>
          <T
            bold
            size={wideWeb ? 36 : compact ? 25 : 28}
            color="#fff"
            style={{
              textAlign: "center",
              lineHeight: wideWeb ? 44 : compact ? 31 : 34,
              letterSpacing: wideWeb ? -1.1 : -0.8,
            }}
          >
            Meet. Talk.{"\n"}Feel connected.
          </T>
          <T
            size={wideWeb ? 16 : 14}
            color="#fff"
            style={{ textAlign: "center", marginTop: 9, opacity: 0.94 }}
          >
            Real conversations, on your terms.
          </T>
        </View>
        <View
          style={{
            flex: wideWeb ? 0.88 : undefined,
            minHeight: wideWeb ? 550 : undefined,
            paddingHorizontal: wideWeb ? 30 : compact ? 16 : 18,
            paddingVertical: wideWeb ? 30 : 0,
            marginTop: wideWeb ? 0 : -20,
            flexGrow: wideWeb ? undefined : 1,
            gap: wideWeb ? 14 : 10,
            justifyContent: wideWeb ? "center" : undefined,
            backgroundColor: wideWeb ? c.low : undefined,
            borderRadius: wideWeb ? 30 : undefined,
            borderWidth: wideWeb ? 1 : undefined,
            borderColor: wideWeb ? c.line : undefined,
            shadowColor: c.deep,
            shadowOpacity: wideWeb ? 0.08 : 0,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 14 },
            elevation: wideWeb ? 3 : 0,
            ...(wideWeb
              ? { boxShadow: "0 20px 54px rgba(25, 13, 47, 0.1)" }
              : {}),
          }}
        >
          <View
            style={{
              alignSelf: "center",
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              backgroundColor: wideWeb ? c.successSurface : c.low,
              borderRadius: 99,
              paddingHorizontal: 14,
              paddingVertical: 8,
              marginBottom: 2,
              shadowColor: c.deep,
              shadowOpacity: 0.08,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 3,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: c.success,
              }}
            />
            <T size={12} bold>
              People are talking now
            </T>
          </View>
          <Card
            style={{
              borderRadius: 24,
              padding: 8,
              gap: 2,
              backgroundColor: wideWeb ? c.background : undefined,
              borderWidth: wideWeb ? 1 : undefined,
              borderColor: wideWeb ? c.line : undefined,
              shadowColor: c.deep,
              shadowOpacity: wideWeb ? 0.03 : 0.08,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 10 },
              elevation: wideWeb ? 0 : 4,
            }}
          >
            {features.map(([icon, title, detail]) => (
              <View
                key={title}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 11,
                  padding: compact ? 8 : 9,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 13,
                    backgroundColor: c.high,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={icon} color={c.mint} size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <T size={14} bold>
                    {title}
                  </T>
                  <T size={12} color={c.secondary}>
                    {detail}
                  </T>
                </View>
              </View>
            ))}
          </Card>
          <View
            style={{ marginTop: wideWeb ? 12 : "auto", paddingTop: 8, gap: 2 }}
          >
            <Button
              title="Continue with mobile"
              icon="arrow-right"
              onPress={() => go("/auth/login")}
            />
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
                gap: 4,
                paddingTop: 10,
                paddingHorizontal: 8,
              }}
            >
              <T size={12} color={c.secondary}>
                By continuing, you agree to our
              </T>
              <Pressable
                accessibilityRole="link"
                onPress={() => go("/settings/policies/terms")}
                hitSlop={8}
              >
                <T
                  size={12}
                  bold
                  color={c.mint}
                  style={{ textDecorationLine: "underline" }}
                >
                  Terms & Conditions
                </T>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
