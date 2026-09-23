const darkColors = {
  background: "#121413",
  low: "#1a1c1b",
  surface: "#1e201f",
  high: "#282a29",
  highest: "#333534",
  mint: "#4edea3",
  ink: "#003824",
  text: "#e2e3e0",
  secondary: "#bbcabf",
  muted: "#86948a",
  line: "#3c4a42",
  error: "#ffb4ab",
  danger: "#93000a",
  warning: "#f2c879",
  deep: "#0c0f0e",
  successSurface: "#1b3028",
  errorSurface: "#38201e",
};
const lightColors: typeof darkColors = {
  background: "#f5f7f4",
  low: "#ffffff",
  surface: "#ffffff",
  high: "#e8ede8",
  highest: "#dce4dc",
  mint: "#159b68",
  ink: "#ffffff",
  text: "#17201a",
  secondary: "#3e5144",
  muted: "#68776c",
  line: "#c9d4cb",
  error: "#b3261e",
  danger: "#ffd9d5",
  warning: "#8a5a00",
  deep: "#eaf0ea",
  successSurface: "#d8f5e6",
  errorSurface: "#ffdad6",
};
export type ColorMode = "dark" | "light";
export const colors = { ...darkColors };
export const setColorMode = (mode: ColorMode) =>
  Object.assign(colors, mode === "light" ? lightColors : darkColors);
export const fonts = {
  // System families are available immediately on Android and iOS, so startup
  // never waits on a font asset before showing the first route.
  regular: "sans-serif",
  medium: "sans-serif-medium",
  bold: "sans-serif-medium",
  mono: "monospace",
};
