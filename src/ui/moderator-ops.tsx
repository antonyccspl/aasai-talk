import { useAuth } from "@/data/auth";
import {
  fetchModeratorQueue,
  fetchModeratorReport,
  fetchModeratorSummary,
  resolveModeratorReport,
  type ModeratorOpsSummary,
  type ModeratorReport,
} from "@/data/moderator-ops";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Card, Chips, Field, Notice, Row, Section, Setting, Shell, T } from "./components";
import { colors as c } from "./theme";

function Metric({ title, value, detail, warning = false }: { title: string; value: string; detail: string; warning?: boolean }) {
  return (
    <Card style={{ flex: 1, minWidth: 150 }}>
      <T size={11} color={c.secondary}>{title}</T>
      <T size={28} bold color={warning ? c.error : c.text}>{value}</T>
      <T size={11} color={c.muted}>{detail}</T>
    </Card>
  );
}

export function ModeratorOps({ page = "dashboard", id }: { page?: string; id?: string }) {
  const auth = useAuth();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<ModeratorOpsSummary | null>(null);
  const [reports, setReports] = useState<ModeratorReport[]>([]);
  const [report, setReport] = useState<ModeratorReport | null>(null);
  const [status, setStatus] = useState<ModeratorReport["status"]>("Under review");
  const [resolutionNote, setResolutionNote] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const detailPage = page === "reports" && Boolean(id);
  const dashboardPage = page === "dashboard" || page === "login" || page === "analytics";

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const token = await auth.getIdentityToken();
      const verifiedSummary = await fetchModeratorSummary(token);
      if (dashboardPage) setSummary(verifiedSummary);
      if (detailPage && id) {
        const row = await fetchModeratorReport(token, id);
        setReport(row);
        setStatus(row.status);
        setResolutionNote(row.resolution_note || "");
      } else if (page === "reports") {
        setReports(await fetchModeratorQueue(token));
      }
      setAuthorized(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load moderator data.");
      setAuthorized(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await load();
      if (!mounted) return;
    })();
    return () => { mounted = false; };
  }, [auth.demoPhone, page, id]);

  const saveReport = async () => {
    if (!report) return;
    setRefreshing(true);
    setError("");
    setSaved("");
    try {
      const updated = await resolveModeratorReport(
        await auth.getIdentityToken(),
        report.id,
        status,
        resolutionNote.trim(),
      );
      setReport({ ...report, status: updated.status, resolution_note: updated.resolution_note });
      setSaved("Report update saved and audit logged.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this report.");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading)
    return <Shell title="Moderator operations"><T color={c.secondary}>Verifying moderator access…</T></Shell>;

  if (!authorized)
    return (
      <Shell title="Moderator access">
        <Notice error>{error || "A verified moderator account is required."}</Notice>
        <Button title="Back to Aasai Talk" onPress={() => router.replace("/explore" as never)} />
      </Shell>
    );

  if (detailPage)
    return (
      <Shell title="Safety report" refreshing={refreshing} onRefresh={() => void load(true)}>
        {report ? (
          <>
            <Row style={{ justifyContent: "space-between" }}>
              <T size={22} bold>Report {report.id.slice(0, 8)}</T>
              <T bold color={report.priority === "high" ? c.error : c.secondary}>{report.priority.toUpperCase()} PRIORITY</T>
            </Row>
            <Card>
              <Setting title="Reported account" detail={report.reported_user_name} icon="user" />
              <Setting title="Reason" detail={report.reason} icon="flag" />
              <Setting title="Reporter" detail={report.reporter_name} icon="shield" />
              <Setting title="Submitted" detail={new Date(report.created_at).toLocaleString()} icon="clock" />
              <T>{report.details || "No additional details provided."}</T>
            </Card>
            <Section title="Resolution" />
            <Chips items={["Open", "Under review", "Resolved", "Rejected"]} selected={status} onChange={(value) => setStatus(value as ModeratorReport["status"])} />
            <Field label="Moderator note" value={resolutionNote} onChange={setResolutionNote} multiline />
            {error ? <Notice error>{error}</Notice> : null}
            {saved ? <Notice>{saved}</Notice> : null}
            <Button title={refreshing ? "Saving…" : "Save resolution"} disabled={refreshing} onPress={() => void saveReport()} />
          </>
        ) : <Notice error>Report not found.</Notice>}
      </Shell>
    );

  if (page === "reports") {
    const ordered = [...reports].sort((left, right) =>
      left.priority === right.priority
        ? left.created_at.localeCompare(right.created_at)
        : left.priority === "high" ? -1 : 1,
    );
    return (
      <Shell title="Moderation queue" refreshing={refreshing} onRefresh={() => void load(true)}>
        <Section title="Needs review" action={`${reports.length} REPORTS`} />
        {error ? <Notice error>{error}</Notice> : null}
        {ordered.map((item) => (
          <Setting
            key={item.id}
            title={`${item.priority === "high" ? "HIGH · " : ""}${item.reason} · ${item.reported_user_name}`}
            detail={`${item.status} · ${item.reporter_name} · ${new Date(item.created_at).toLocaleDateString()}`}
            icon="flag"
            onPress={() => router.push(`/admin/reports/${item.id}` as never)}
          />
        ))}
        {!reports.length && <Notice>No open reports need review.</Notice>}
        <Button title="Operations overview" variant="secondary" onPress={() => router.push("/admin" as never)} />
      </Shell>
    );
  }

  if (dashboardPage && summary)
    return (
      <Shell title={page === "analytics" ? "Operations analytics" : "Moderator operations"} refreshing={refreshing} onRefresh={() => void load(true)}>
        <Row style={{ flexWrap: "wrap", alignItems: "stretch" }}>
          <Metric title="CALLS · 7 DAYS" value={String(summary.calls_total)} detail={`${summary.calls_connected} active now`} />
          <Metric title="COMPLETION" value={`${summary.completion_rate}%`} detail={`${summary.calls_completed} completed`} />
          <Metric title="FAILED CALLS" value={String(summary.calls_failed)} detail="Missed, rejected, cancelled" warning={summary.calls_failed > 0} />
        </Row>
        <Row style={{ flexWrap: "wrap", alignItems: "stretch" }}>
          <Metric title="OPEN REPORTS" value={String(summary.reports_open)} detail={`${summary.reports_priority} high priority`} warning={summary.reports_priority > 0} />
          <Metric title="HOSTS ONLINE" value={`${summary.hosts_online} / ${summary.hosts_approved}`} detail="Heartbeat in the last minute" />
        </Row>
        {error ? <Notice error>{error}</Notice> : null}
        {page === "analytics" && (
          <Card>
            <Section title="Daily call outcomes" action="LAST 7 DAYS" />
            {summary.daily_calls.map((day) => (
              <Setting
                key={day.date}
                title={new Date(`${day.date}T00:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                detail={`${day.completed} completed · ${day.failed} failed · ${day.total} total`}
                icon="bar-chart-2"
              />
            ))}
          </Card>
        )}
        <Card style={{ gap: 8 }}>
          <T size={18} bold>Release readiness</T>
          <T size={12} color={c.secondary}>Review these live signals before a public release.</T>
          <Setting title="Phone sign-in" detail="Complete one OTP sign-in on a real device" icon="check-circle" />
          <Setting title="Calls" detail={summary.calls_failed ? `${summary.calls_failed} recent calls need review` : "Recent call outcomes look clear"} icon="phone" />
          <Setting title="Messages" detail="Send and receive one message on two devices" icon="message-circle" />
          <Setting title="Host availability" detail={`${summary.hosts_online} host${summary.hosts_online === 1 ? "" : "s"} currently available`} icon="users" />
          <Setting title="Safety queue" detail={summary.reports_open ? `${summary.reports_open} report${summary.reports_open === 1 ? "" : "s"} awaiting review` : "No open reports"} icon="shield" />
        </Card>
        <Button title="Open priority report queue" icon="flag" onPress={() => router.push("/admin/reports" as never)} />
        <Button title="View analytics" variant="secondary" onPress={() => router.push("/admin/analytics" as never)} />
      </Shell>
    );

  return (
    <Shell title="Moderator operations">
      <Notice>This moderation view is not available for this route.</Notice>
      <Button title="Operations overview" onPress={() => router.replace("/admin" as never)} />
    </Shell>
  );
}
