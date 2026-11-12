// Soft blush surfaces and a deeper coral keep the interface warm and readable.
export const colors = {
  background: "#fff9f6",
  low: "#ffffff",
  surface: "#fff1ee",
  high: "#fae6ea",
  highest: "#edd5dd",
  mint: "#b02f46",
  ink: "#ffffff",
  text: "#291d27",
  secondary: "#6e5962",
  muted: "#76656e",
  line: "#f0dfe2",
  glow: "#fffcfa",
  success: "#1a9d73",
  error: "#b63f58",
  danger: "#a9344f",
  warning: "#a96b22",
  deep: "#281a21",
  successSurface: "#edf8f2",
  errorSurface: "#fff0f1",
  champagne: "#e9c985",
  plum: "#4d263d",
  lilac: "#ecd8e6",
};
export const fonts = {
  regular: "Figtree_400Regular",
  medium: "Figtree_600SemiBold",
  bold: "Figtree_700Bold",
  mono: "Figtree_600SemiBold",
};

/** Semantic feedback colors, independent of the brand/action palette. */
export const feedback = {
  info: { background: "#F0F5FF", border: "#D7E3F8", accent: "#315DA8", text: "#334B70", iconBackground: "#E0EAFC", icon: "info", label: "Information" },
  success: { background: "#EFF8F3", border: "#CCE7D7", accent: "#23734D", text: "#365E49", iconBackground: "#D9EFE2", icon: "check-circle", label: "Success" },
  warning: { background: "#FFFAEE", border: "#EDDFB8", accent: "#8C6019", text: "#6B542D", iconBackground: "#F8EDCF", icon: "alert-triangle", label: "Please note" },
  error: { background: "#FFF2F3", border: "#F0D1D6", accent: "#A33149", text: "#793C49", iconBackground: "#F9DFE5", icon: "alert-circle", label: "Something went wrong" },
} as const;
export type FeedbackTone = keyof typeof feedback;
