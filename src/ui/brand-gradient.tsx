import { StyleSheet, View } from "react-native";

/** Native view gradient shared by primary actions and selected controls. */
export function BrandGradient({ dark = false }: { dark?: boolean }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {Array.from({ length: 64 }, (_, i) => {
      const t = i / 63;
      const rgb = dark
        ? [38 - 14 * t, 20 - 8 * t, 78 - 22 * t]
        : [112 + 126 * t, 67 - 24 * t, 244 - 54 * t];
      return <View key={i} style={{ position: "absolute", top: 0, bottom: 0, left: `${i * 100 / 64}%`, width: "1.7%", backgroundColor: `rgb(${rgb.map(Math.round).join(",")})` }} />;
    })}
  </View>;
}
