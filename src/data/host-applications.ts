import { supabase, withSupabaseRequestTimeout } from "./supabase";
import { submitProfilePhotoForModeration } from "./content-moderation";

export type HostApplicationStatus =
  | "none"
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "inactive"
  | "archived";

export type HostApplicationInput = {
  name: string;
  bio: string;
  languages: string[];
  interests: string[];
  audio: boolean;
  video: boolean;
  audioRate: string;
  videoRate: string;
  photo?: string;
  aadhaarDocument: string;
  panDocument: string;
  aadhaarPath?: string;
  panPath?: string;
};

export async function submitPhoneHostApplication(
  phone: string,
  application: HostApplicationInput,
  idToken: string,
) {
  let photo = application.photo;
  let photoReviewId: string | undefined;
  if (photo && !/^https?:\/\//i.test(photo)) {
    const result = await submitProfilePhotoForModeration(idToken, photo);
    if (result.status === "approved") photo = result.publicUrl;
    else {
      photoReviewId = result.id;
      photo = undefined;
    }
  }
  const fixedRateApplication: Record<string, unknown> = {
    ...application,
    audioRate: "2",
    videoRate: "5",
  };
  delete fixedRateApplication.photo;
  if (photo) fixedRateApplication.photo = photo;
  if (photoReviewId) fixedRateApplication.photo_review_id = photoReviewId;
  const { data, error } = await supabase.rpc("submit_phone_host_application", {
    input_phone: phone,
    input_application: fixedRateApplication,
  });
  if (error) throw error;
  if (typeof data !== "string") {
    throw new Error("Host application was not created.");
  }
  return { id: data, photo };
}

export async function fetchPhoneHostApplicationStatus(
  phone: string,
): Promise<HostApplicationStatus> {
  const { data, error } = await withSupabaseRequestTimeout((signal) =>
    supabase
      .rpc("get_phone_host_application_status", { input_phone: phone })
      .abortSignal(signal),
  );
  if (error) throw error;
  if (
    data !== "none" &&
    data !== "draft" &&
    data !== "pending" &&
    data !== "approved" &&
    data !== "rejected" &&
    data !== "inactive" &&
    data !== "archived"
  ) {
    throw new Error("Invalid host application status.");
  }
  return data as HostApplicationStatus;
}
