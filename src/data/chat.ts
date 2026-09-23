import { supabase } from "./supabase";

export type PhoneMessage = {
  id: string;
  sender_phone: string;
  recipient_phone: string;
  text: string;
  created_at: string;
};
export type PhoneConversation = {
  other_phone: string;
  last_text: string;
  last_created_at: string;
};

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

export async function sendPhoneMessage(
  phone: string,
  otherPhone: string,
  text: string,
) {
  const { data, error } = await supabase.rpc("send_phone_message", {
    input_sender_phone: phone,
    input_recipient_phone: otherPhone,
    input_text: text,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("Message was not saved.");
  const row = data as Record<string, unknown>;
  if (!isMessage(row.message) || row.coins_charged !== 1 || typeof row.remaining_coins !== "number")
    throw new Error("Invalid message billing response.");
  return { message: row.message, remainingCoins: row.remaining_coins };
}

export function subscribeToPhoneMessages(
  phone: string,
  otherPhone: string,
  onMessage: (message: PhoneMessage) => void,
) {
  let active = true;
  const channel = supabase
    .channel(`phone-chat-${phone.replace(/\D/g, "")}-${otherPhone.replace(/\D/g, "")}`)
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
  const channel = supabase
    .channel(`phone-inbox-${phone.replace(/\D/g, "")}`)
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
