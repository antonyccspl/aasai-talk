export const COINS_PER_RUPEE = 1.5;
export const COINS_PER_DIAMOND = 10;
export const AUDIO_CALL_DIAMONDS_PER_MINUTE = 2;
export const VIDEO_CALL_DIAMONDS_PER_MINUTE = 4;
export const AUDIO_HOST_EARNINGS_RUPEES_PER_MINUTE = 5;
export const VIDEO_HOST_EARNINGS_RUPEES_PER_MINUTE = 10;

export function callCoinsPerMinute(callType: "audio" | "video") {
  const diamonds =
    callType === "video"
      ? VIDEO_CALL_DIAMONDS_PER_MINUTE
      : AUDIO_CALL_DIAMONDS_PER_MINUTE;
  return diamonds * COINS_PER_DIAMOND;
}

export function callDiamondsPerMinute(callType: "audio" | "video") {
  return callType === "video"
    ? VIDEO_CALL_DIAMONDS_PER_MINUTE
    : AUDIO_CALL_DIAMONDS_PER_MINUTE;
}

export function callCoinCost(seconds: number, callType: "audio" | "video") {
  return seconds ? Math.ceil(seconds / 60) * callCoinsPerMinute(callType) : 0;
}

export function formatCoins(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1,
  }).format(Math.abs(amount));
}
