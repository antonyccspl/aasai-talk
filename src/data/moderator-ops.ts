import { supabasePublishableKey, supabaseUrl } from "./supabase-config";

export type ModeratorReport = {
  id: string;
  reporter_name: string;
  reported_user_id: string;
  reported_user_name: string;
  reason: string;
  details: string;
  status: "Open" | "Under review" | "Resolved" | "Rejected";
  resolution_note: string | null;
  created_at: string;
  priority: "high" | "normal";
};

export type ModeratorOpsSummary = {
  period_days: number;
  calls_total: number;
  calls_completed: number;
  calls_failed: number;
  calls_ringing: number;
  calls_connected: number;
  completion_rate: number;
  reports_open: number;
  reports_priority: number;
  hosts_approved: number;
  hosts_online: number;
  daily_calls: { date: string; total: number; completed: number; failed: number }[];
};

async function moderatorRequest<T>(idToken: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/functions/v1/moderator-ops`, {
    method: "POST",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `Moderator request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

export async function fetchModeratorSummary(idToken: string) {
  const result = await moderatorRequest<{ summary: ModeratorOpsSummary }>(idToken, "summary");
  return result.summary;
}

export async function fetchModeratorQueue(idToken: string) {
  const result = await moderatorRequest<{ reports: ModeratorReport[] }>(idToken, "queue");
  return result.reports;
}

export async function fetchModeratorReport(idToken: string, reportId: string) {
  const result = await moderatorRequest<{ report: ModeratorReport }>(idToken, "report", { report_id: reportId });
  return result.report;
}

export async function resolveModeratorReport(
  idToken: string,
  reportId: string,
  status: ModeratorReport["status"],
  resolutionNote: string,
) {
  const result = await moderatorRequest<{ report: Pick<ModeratorReport, "id" | "status" | "resolution_note"> }>(
    idToken,
    "resolve",
    { report_id: reportId, status, resolution_note: resolutionNote },
  );
  return result.report;
}