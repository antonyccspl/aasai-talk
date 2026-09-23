import { supabase } from "./supabase";

export type HostApplicationStatus =
  | "none"
  | "draft"
  | "pending"
  | "approved"
  | "rejected";

export type HostApplicationInput = {
  name: string;
  bio: string;
  languages: string[];
  interests: string[];
  audio: boolean;
  video: boolean;
  audioRate: string;
  videoRate: string;
  aadhaarDocument: string;
  panDocument: string;
};

export async function submitPhoneHostApplication(
  phone: string,
  application: HostApplicationInput,
) {
  const fixedRateApplication = {
    ...application,
    audioRate: "2",
    videoRate: "5",
  };
  const { data, error } = await supabase.rpc("submit_phone_host_application", {
    input_phone: phone,
    input_application: fixedRateApplication,
  });
  if (error) throw error;
  if (typeof data !== "string") {
    throw new Error("Host application was not created.");
  }
  return data;
}

export async function fetchPhoneHostApplicationStatus(
  phone: string,
): Promise<HostApplicationStatus> {
  const { data, error } = await supabase.rpc(
    "get_phone_host_application_status",
    { input_phone: phone },
  );
  if (error) throw error;
  if (
    data !== "none" &&
    data !== "draft" &&
    data !== "pending" &&
    data !== "approved" &&
    data !== "rejected"
  ) {
    throw new Error("Invalid host application status.");
  }
  return data as HostApplicationStatus;
}
