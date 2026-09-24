import { supabase } from "./supabase";

export type PhoneMessage = {
  id: string;
  sender_phone: string;
  recipient_phone: string;
  text: string;
  created_at: string;
  read_at?: string | null;
};
export type PhoneMessageNotification = Pick<PhoneMessage, "id" | "sender_phone" | "text" | "created_at" | "read_at">;
export type PhoneConversation = {
  other_phone: string;
  last_text: string;
  last_created_at: string;
};

export function isValidPhoneNumber(phone: string) {
  return /^\+91\d{10}$/.test(phone);
}

function isMessage(value: unknown): value is PhoneMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" &&
    typeof row.sender_phone === "string" &&
    typeof row.recipient_phone === "string" &&
    typeof row.text === "string" &&
    typeof row.created_at === "string";
}

export async function fetchPhoneMessages(phone: string, otherPhone: string) {
  if (!isValidPhoneNumber(phone) || !isValidPhoneNumber(otherPhone)) {
    return [] as PhoneMessage[];
  }
  const { data, error } = await supabase.rpc("get_phone_messages", {
    input_phone: phone,
    input_other_phone: otherPhone,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || !data.every(isMessage))
    throw new Error("Invalid chat history returned by the server.");
  return data;
}

export async function fetchPhoneConversations(phone: string) {
  if (!isValidPhoneNumber(phone)) {
    return [] as PhoneConversation[];
  }
  const { data, error } = await supabase.rpc("get_phone_conversations", {
    input_phone: phone,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || !data.every((row) =>
    row && typeof row === "object" &&
    typeof row.other_phone === "string" &&
    typeof row.last_text === "string" &&
    typeof row.last_created_at === "string"
  ))
    throw new Error("Invalid conversations returned by the server.");
  return data as PhoneConversation[];
}

export async function fetchPhoneUnreadMessageCount(phone: string) {
  if (!isValidPhoneNumber(phone)) return 0;
  const { data, error } = await supabase.rpc("get_phone_unread_message_count", { input_phone: phone });
  if (error) throw new Error(error.message);
  if (typeof data !== "number" || data < 0) throw new Error("Invalid unread-message count returned by the server.");
  return data;
}

export async function fetchPhoneMessageNotifications(phone: string) {
  if (!isValidPhoneNumber(phone)) return [] as PhoneMessageNotification[];
  const { data, error } = await supabase.rpc("get_phone_message_notifications", { input_phone: phone });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || !data.every((row) =>
    row && typeof row === "object" && typeof (row as Record<string, unknown>).id === "string" &&
    typeof (row as Record<string, unknown>).sender_phone === "string" &&
    typeof (row as Record<string, unknown>).text === "string" &&
    typeof (row as Record<string, unknown>).created_at === "string" &&
    (((row as Record<string, unknown>).read_at === null) || typeof (row as Record<string, unknown>).read_at === "string")
  )) throw new Error("Invalid message notifications returned by the server.");
  return data as PhoneMessageNotification[];
}

export async function markPhoneConversationRead(phone: string, otherPhone: string) {
  if (!isValidPhoneNumber(phone) || !isValidPhoneNumber(otherPhone)) return 0;
  const { data, error } = await supabase.rpc("mark_phone_conversation_read", {
    input_phone: phone,
    input_other_phone: otherPhone,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "number" || data < 0) throw new Error("Invalid read-receipt response.");
  return data;
}

export async function sendPhoneMessage(
  phone: string,
  otherPhone: string,
  text: string,
) {
  if (!isValidPhoneNumber(phone) || !isValidPhoneNumber(otherPhone)) {
    throw new Error("Invalid phone");
  }
  const { data, error } = await supabase.rpc("send_phone_message", {
    input_sender_phone: phone,
    input_recipient_phone: otherPhone,
    input_text: text,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("Message was not saved.");
  const row = data as Record<string, unknown>;
  if (
    !isMessage(row.message) ||
    row.coins_charged !== 1 ||
    typeof row.remaining_coins !== "number"
  )
    throw new Error("Invalid message billing response.");
  return { message: row.message, remainingCoins: row.remaining_coins };
}

let channelCounter = 0;

export function subscribeToPhoneMessages(
  phone: string,
  otherPhone: string,
  onMessage: (message: PhoneMessage) => void,
) {
  let active = true;
  const suffix = ++channelCounter;
  const channel = supabase
    .channel(`phone-chat-${phone.replace(/\D/g, "")}-${otherPhone.replace(/\D/g, "")}-${suffix}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "phone_messages" },
      (payload) => {
        if (!active || !isMessage(payload.new)) return;
        const message = payload.new;
        if (
          (message.sender_phone === phone && message.recipient_phone === otherPhone) ||
          (message.sender_phone === otherPhone && message.recipient_phone === phone)
        )
          onMessage(message);
      },
    )
    .subscribe();
  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export function subscribeToAllPhoneMessages(
  phone: string,
  onMessage: (message: PhoneMessage) => void,
) {
  let active = true;
  const suffix = ++channelCounter;
  const channel = supabase
    .channel(`phone-inbox-${phone.replace(/\D/g, "")}-${suffix}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "phone_messages" },
      (payload) => {
        if (active && isMessage(payload.new)) {
          const message = payload.new;
          if (message.sender_phone === phone || message.recipient_phone === phone)
            onMessage(message);
        }
      },
    )
    .subscribe();
  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}
