import { supabase } from "./supabase";

export type CallType = "audio" | "video";
export type CallSessionStatus =
  "ringing" | "connected" | "ended" | "missed" | "rejected" | "cancelled";

export type CallSession = {
  id: string;
  roomId: string;
  status: CallSessionStatus;
  callType: CallType;
};

export type PhoneCallSummary = {
  id: string;
  call_type: CallType;
  status: CallSessionStatus;
  duration_seconds: number;
  coins_charged: number;
  connected: boolean;
};

export type HostCallCapabilities = { audio: boolean; video: boolean };
export type PhoneCallState = {
  status: CallSessionStatus;
  callType: CallType;
  videoUpgradeRequestedBy?: string;
  remainingCoins?: number;
};

export async function fetchPhoneHostCallCapabilities(
  hostPhone: string,
): Promise<HostCallCapabilities> {
  const { data, error } = await supabase.rpc(
    "get_phone_host_call_capabilities",
    {
      input_host_phone: hostPhone,
    },
  );
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object")
    throw new Error("Invalid Host call capabilities.");
  const row = data as Record<string, unknown>;
  if (typeof row.audio !== "boolean" || typeof row.video !== "boolean")
    throw new Error("Invalid Host call capabilities.");
  return { audio: row.audio, video: row.video };
}

export async function requestPhoneCallVideoUpgrade(
  sessionId: string,
  phone: string,
) {
  const { error } = await supabase.rpc("request_phone_call_video_upgrade", {
    input_session_id: sessionId,
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
}

export async function acceptPhoneCallVideoUpgrade(
  sessionId: string,
  phone: string,
) {
  const { data, error } = await supabase.rpc(
    "accept_phone_call_video_upgrade",
    {
      input_session_id: sessionId,
      input_phone: phone,
    },
  );
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object")
    throw new Error("Video upgrade was not accepted.");
  const row = data as Record<string, unknown>;
  if (row.call_type !== "video" || typeof row.coins_per_minute !== "number")
    throw new Error("Invalid video switch response.");
  return {
    callType: "video" as const,
    coinsPerMinute: row.coins_per_minute,
    ...(typeof row.remaining_coins === "number"
      ? { remainingCoins: row.remaining_coins }
      : {}),
  };
}

export async function fetchPhoneCallState(
  sessionId: string,
  phone: string,
): Promise<PhoneCallState> {
  const { data, error } = await supabase.rpc("get_phone_call_state", {
    input_session_id: sessionId,
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("Invalid call state.");
  const row = data as Record<string, unknown>;
  if (
    ![
      "ringing",
      "connected",
      "ended",
      "missed",
      "rejected",
      "cancelled",
    ].includes(String(row.status)) ||
    (row.call_type !== "audio" && row.call_type !== "video")
  )
    throw new Error("Invalid call state.");
  const requestedBy = row.video_upgrade_requested_by;
  const remainingCoins = row.remaining_coins;
  if (
    requestedBy !== null &&
    requestedBy !== undefined &&
    typeof requestedBy !== "string"
  )
    throw new Error("Invalid video upgrade request.");
  if (
    remainingCoins !== null &&
    remainingCoins !== undefined &&
    typeof remainingCoins !== "number"
  )
    throw new Error("Invalid caller wallet balance.");
  return {
    status: row.status as CallSessionStatus,
    callType: row.call_type,
    ...(typeof requestedBy === "string"
      ? { videoUpgradeRequestedBy: requestedBy }
      : {}),
    ...(typeof remainingCoins === "number" ? { remainingCoins } : {}),
  };
}

export async function fetchPhoneCallSummary(sessionId: string, phone: string) {
  const { data, error } = await supabase.rpc("get_phone_call_summary", {
    input_session_id: sessionId,
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object")
    throw new Error("Invalid call summary.");
  const row = data as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    (row.call_type !== "audio" && row.call_type !== "video") ||
    ![
      "ringing",
      "connected",
      "ended",
      "missed",
      "rejected",
      "cancelled",
    ].includes(String(row.status)) ||
    typeof row.duration_seconds !== "number" ||
    !Number.isSafeInteger(row.duration_seconds) ||
    row.duration_seconds < 0 ||
    typeof row.coins_charged !== "number" ||
    !Number.isSafeInteger(row.coins_charged) ||
    row.coins_charged < 0 ||
    typeof row.connected !== "boolean"
  )
    throw new Error("Invalid call summary.");
  return row as PhoneCallSummary;
}

export async function startPhoneCall(
  callerPhone: string,
  hostPhone: string,
  callType: CallType,
): Promise<CallSession> {
  const { error: cleanupError } = await supabase.rpc(
    "clear_stale_phone_calls",
    {
      input_phone: callerPhone,
    },
  );
  if (cleanupError) console.warn("Failed to clear stale calls:", cleanupError);
  const { data, error } = await supabase.rpc("start_phone_call", {
    input_caller_phone: callerPhone,
    input_host_phone: hostPhone,
    input_call_type: callType,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object")
    throw new Error("Call was not created.");
  const row = data as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.room_id !== "string" ||
    (row.status !== "ringing" && row.status !== "connected") ||
    (row.call_type !== "audio" && row.call_type !== "video")
  )
    throw new Error("Invalid call session returned by the server.");
  return {
    id: row.id,
    roomId: row.room_id,
    status: row.status,
    callType: row.call_type,
  };
}

export async function updatePhoneCall(
  sessionId: string,
  phone: string,
  status: Exclude<CallSessionStatus, "ringing">,
  durationSeconds = 0,
) {
  const { error } = await supabase.rpc("update_phone_call", {
    input_session_id: sessionId,
    input_phone: phone,
    input_status: status,
    input_duration_seconds: durationSeconds,
  });
  if (error) throw new Error(error.message);
  // A cancelled invitation must never be treated as an accepted call.
  if (status === "connected") {
    const { data: current, error: statusError } = await supabase.rpc(
      "get_phone_call_status",
      {
        input_session_id: sessionId,
        input_phone: phone,
      },
    );
    if (statusError) throw new Error(statusError.message);
    if (current !== "connected")
      throw new Error("This call has already ended.");
  }
}

export async function settlePhoneCall(sessionId: string, phone: string) {
  const { data, error } = await supabase.rpc("settle_phone_call", {
    input_session_id: sessionId,
    input_phone: phone,
  });
  if (error) throw error;
  return data as {
    coins_charged: number;
    diamonds_charged: number;
    diamonds_per_minute: number;
    host_earnings_paise: number;
    duration_seconds: number;
    daily_seconds: number;
  };
}

export async function chargePhoneCallMinute(
  sessionId: string,
  phone: string,
  minuteNumber: number,
) {
  const { data, error } = await supabase.rpc("charge_phone_call_minute", {
    input_session_id: sessionId,
    input_phone: phone,
    input_minute_number: minuteNumber,
  });
  if (error) throw error;
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== "object")
    return { charged: false, responseInvalid: true } as {
      charged: boolean;
      responseInvalid?: boolean;
      remaining_coins?: number;
      insufficient_balance?: boolean;
      diamonds_charged?: number;
      diamonds_required?: number;
    };
  const row = candidate as Record<string, unknown>;
  const numberValue = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(Number(value))
    )
      return Number(value);
    return undefined;
  };
  const remainingCoins = numberValue(row.remaining_coins);
  const diamondsCharged = numberValue(row.diamonds_charged);
  const diamondsRequired = numberValue(row.diamonds_required);
  const charged = row.charged === true || row.charged === "true";
  if (
    remainingCoins === undefined ||
    (charged && diamondsCharged === undefined)
  ) {
    return {
      charged,
      responseInvalid: true,
      ...(diamondsCharged === undefined
        ? {}
        : { diamonds_charged: diamondsCharged }),
      ...(diamondsRequired === undefined
        ? {}
        : { diamonds_required: diamondsRequired }),
    } as {
      charged: boolean;
      responseInvalid?: boolean;
      remaining_coins?: number;
      insufficient_balance?: boolean;
      diamonds_charged?: number;
      diamonds_required?: number;
    };
  }
  return {
    ...row,
    charged,
    remaining_coins: remainingCoins,
    ...(diamondsCharged === undefined
      ? {}
      : { diamonds_charged: diamondsCharged }),
    ...(diamondsRequired === undefined
      ? {}
      : { diamonds_required: diamondsRequired }),
  } as {
    charged: boolean;
    call_active?: boolean;
    minute_complete?: boolean;
    already_charged?: boolean;
    insufficient_balance?: boolean;
    diamonds_charged?: number;
    diamonds_required?: number;
    coins_charged?: number;
    coins_required?: number;
    remaining_coins?: number;
    responseInvalid?: boolean;
  };
}

export function subscribeToIncomingCalls(
  phone: string,
  onCall: (call: {
    id: string;
    caller_phone: string;
    call_type: CallType;
    room_id: string;
  }) => void,
) {
  let active = true;
  let lastCallId = "";
  let polling = false;
  const notify = (value: unknown) => {
    if (!active || !value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      row.id === lastCallId ||
      typeof row.caller_phone !== "string" ||
      typeof row.room_id !== "string" ||
      (row.call_type !== "audio" && row.call_type !== "video")
    )
      return;
    lastCallId = row.id;
    onCall({
      id: row.id,
      caller_phone: row.caller_phone,
      call_type: row.call_type,
      room_id: row.room_id,
    });
  };
  const poll = async () => {
    if (!active || polling) return;
    polling = true;
    try {
      const { data, error } = await supabase.rpc("get_incoming_phone_call", {
        input_phone: phone,
      });
      if (error) {
        console.error("Failed to poll incoming calls:", error);
        return;
      }
      notify(data);
    } catch (error) {
      if (active) console.warn("Incoming call refresh failed:", error);
    } finally {
      polling = false;
    }
  };
  void poll();
  // The RPC is the authorized signaling path. Direct Realtime table events
  // require table read access that phone-login Hosts intentionally do not have.
  const pollTimer = setInterval(() => void poll(), 750);
  let cleanedUp = false;
  return () => {
    if (cleanedUp) return;
    cleanedUp = true;
    active = false;
    clearInterval(pollTimer);
  };
}

export function subscribeToPhoneCall(
  sessionId: string,
  phone: string,
  onStatus: (status: CallSessionStatus) => void,
) {
  return subscribeToPhoneCallState(sessionId, phone, (state) =>
    onStatus(state.status),
  );
}

export function subscribeToPhoneCallState(
  sessionId: string,
  phone: string,
  onState: (state: PhoneCallState) => void,
) {
  let active = true;
  let polling = false;
  let previous = "";
  const notify = (state: PhoneCallState) => {
    const key = `${state.status}:${state.callType}:${state.videoUpgradeRequestedBy ?? ""}`;
    if (active && key !== previous) {
      previous = key;
      onState(state);
    }
  };
  // The phone-login prototype cannot read call_sessions through RLS.
  // Poll the participant RPC as well as listening for realtime changes.
  const poll = async () => {
    if (!active || polling) return;
    polling = true;
    try {
      notify(await fetchPhoneCallState(sessionId, phone));
    } catch (error) {
      if (active) console.warn("Call status refresh failed:", error);
    } finally {
      polling = false;
    }
  };
  void poll();
  // Phone-login participants cannot SELECT call_sessions directly through RLS.
  // Keep the authorized signal responsive so a remote end action tears down
  // the other device's call promptly, including while its call screen is open.
  const timer = setInterval(() => void poll(), 500);
  const channel = supabase
    .channel(`call-status-${sessionId}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "call_sessions",
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        if (!active) return;
        const row = payload.new as Record<string, unknown>;
        const status = row.status;
        const callType = row.call_type;
        if (
          (status === "ringing" ||
            status === "connected" ||
            status === "ended" ||
            status === "missed" ||
            status === "rejected" ||
            status === "cancelled") &&
          (callType === "audio" || callType === "video")
        )
          notify({ status, callType });
      },
    )
    .subscribe();
  return () => {
    active = false;
    clearInterval(timer);
    void supabase.removeChannel(channel);
  };
}
