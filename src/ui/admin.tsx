import React, { useState } from "react";
import {
  ScrollView,
  View,
  Pressable,
  useWindowDimensions,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  Badge,
  AasaiTalkMark,
  Button,
  Card,
  Chips,
  Empty,
  Field,
  go,
  Icon,
  Notice,
  Row,
  Section,
  Setting,
  T,
} from "./components";
import { money, people, useDemo } from "./store";
import { colors as c } from "./theme";

const nav = [
  ["Overview", "dashboard"],
  ["Users", "users"],
  ["Host applications", "host-applications"],
  ["Reports", "reports"],
  ["Calls", "calls"],
  ["Payments", "payments"],
  ["Wallets", "wallets"],
  ["Pricing", "pricing"],
  ["App settings", "settings"],
  ["Announcements", "announcements"],
  ["Analytics", "analytics"],
  ["Audit logs", "audit"],
  ["Reconciliation", "reconciliation"],
];
export function Admin({
  page = "dashboard",
  id,
}: {
  page?: string;
  id?: string;
}) {
  const d = useDemo();
  const wide = useWindowDimensions().width >= 900;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [notice, setNotice] = useState("");
  const edit = d.adminEdits;
  const setEdit = d.setAdminEdits;
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const audit = d.audit;
  const setAudit = d.setAudit;
  const title = nav.find((x) => x[1] === page)?.[0] || "Administration";
  const save = (action: string) => {
    setAudit((v) => [
      `${action} · demo admin · ${new Date().toLocaleTimeString()}`,
      ...v,
    ]);
    setNotice(
      `${action} saved.`,
    );
    setConfirm("");
  };
  const field = (label: string, initial = "") => (
    <Field
      key={label}
      label={label}
      value={edit[label] ?? initial}
      onChange={(v) => setEdit((x) => ({ ...x, [label]: v }))}
    />
  );
  const action = (label: string) => (
    <Button
      key={label}
      title={label}
      variant="secondary"
      onPress={() => setConfirm(label)}
    />
  );
  const stats = [
    ["Total users", String(d.people.length), "Directory"],
    ["Online now", String(d.people.filter(person => person.status === 'Available').length), "Available"],
    ["Calls", String(d.calls.length), "All sessions"],
    ["Recharge coins", String(d.transactions.filter(row => row.kind === 'Recharges').reduce((sum, row) => sum + row.amount, 0)), "Current history"],
  ];
  if (page === "login")
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView
          contentContainerStyle={{
            padding: 30,
            alignItems: "center",
            justifyContent: "center",
            flexGrow: 1,
          }}
        >
          <Card style={{ maxWidth: 440, width: "100%" }}>
            <AasaiTalkMark size={46} />
            <T size={30} bold>
              Aasai Talk admin
            </T>
            <T color={c.secondary}>A clear view of your community.</T>
            {field("Admin email", "demo@asaitalk.local")}
            {field("Demo access code", "")}
            <Notice>
              Preview access only. This form does not authenticate an
              administrator.
            </Notice>
            <Button title="Open admin preview" onPress={() => go("/admin")} />
            <Button
              title="Back to mobile preview"
              variant="secondary"
              onPress={() => go("/explore")}
            />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  let content: React.ReactNode;
  if (page === "dashboard" || page === "analytics")
    content = (
      <>
        <Row style={{ flexWrap: "wrap", alignItems: "stretch" }}>
          {stats.map(([label, value, change]) => (
            <Card key={label} style={{ flexGrow: 1, minWidth: 190 }}>
              <T size={12} color={c.secondary}>
                {label}
              </T>
              <T size={31} bold>
                {value}
              </T>
              <T mono size={11} color={c.mint}>
                {change}
              </T>
            </Card>
          ))}
        </Row>
        <Row style={{ alignItems: "stretch", flexWrap: "wrap" }}>
          <Card style={{ flex: 2, minWidth: 280 }}>
            <Section
              title={
                page === "analytics"
                  ? "Conversation retention"
                  : "Conversations this week"
              }
              action="SUPABASE METRICS"
            />
            <Row
              style={{
                alignItems: "flex-end",
                justifyContent: "space-around",
                minHeight: 180,
              }}
            >
              {d.chart.map((h, i) => (
                <View
                  key={i}
                  style={{ alignItems: "center", gap: 10, flex: 1 }}
                >
                  <View
                    style={{
                      height: h,
                      width: "56%",
                      borderRadius: 8,
                      backgroundColor: i === 5 ? c.mint : c.successSurface,
                    }}
                  />
                  <T mono size={10} color={c.muted}>
                    {["M", "T", "W", "T", "F", "S", "S"][i]}
                  </T>
                </View>
              ))}
            </Row>
            <T size={12} color={c.secondary}>
              Live 7-day conversation activity trends synced from Supabase.
            </T>
          </Card>
          <Card style={{ flex: 1, minWidth: 260 }}>
            <Section title="Needs attention" />
            <Setting
              title={`${d.safetyReports.filter((r) => r.status === "Open").length || d.reports.length} open reports`}
              detail="Review community concerns"
              icon="flag"
              onPress={() => go("/admin/reports")}
            />
            <Setting
              title={`${d.transactions.filter((t) => t.status === "Processing" || t.status === "Pending").length} payments pending`}
              detail="Awaiting bank settlement"
              icon="clock"
              onPress={() => go("/admin/payments")}
            />
            <Setting
              title={`${d.calls.filter((c) => c.status === "Ended").length} completed calls`}
              detail={`${d.calls.length} total call sessions`}
              icon="phone"
              onPress={() => go("/admin/calls")}
            />
          </Card>
        </Row>
        {page === "analytics" && (
          <Card>
            <T size={20} bold>
              Metric definitions
            </T>
            <T color={c.secondary}>
              DAU/MAU: unique active accounts per day/month. Retention: cohort
              return rate. Call acceptance: accepted calls divided by initiated
              calls. Revenue must be distinguished from wallet recharge volume.
            </T>
            {[
              `Total Profiles · ${d.people.length}`,
              `Available Now · ${d.people.filter((p) => p.status === "Available").length}`,
              `Call Sessions · ${d.calls.length}`,
              `Audio Minutes · ${Math.round(d.calls.filter((c) => c.type === "audio").reduce((s, c) => s + c.seconds, 0) / 60)} mins`,
              `Video Minutes · ${Math.round(d.calls.filter((c) => c.type === "video").reduce((s, c) => s + c.seconds, 0) / 60)} mins`,
              `Wallet Volume · ₹${d.transactions.filter((t) => t.kind === "Recharges").reduce((s, t) => s + t.amount, 0)}`,
            ].map((x) => (
              <Setting key={x} title={x} icon="bar-chart-2" />
            ))}
          </Card>
        )}
      </>
    );
  else if (page === "users")
    content = id ? (
      <>
        <Card>
          <T size={26} bold>
            {people.find((p) => p.id === id)?.name || id}
          </T>
          <Badge
            text={d.blocked.includes(id) ? "Suspended in demo" : "Active"}
          />
          <T color={c.secondary}>Account ID: {id}</T>
          <T color={c.secondary}>
            Profile, moderation history, related calls and wallet records.
          </T>
          <Row style={{ flexWrap: "wrap" }}>
            {action("Suspend user")}
            {action("Restore user")}
            {action("Delete account")}
            <Button
              title="View wallet"
              onPress={() => go(`/admin/wallets/${id}`)}
            />
            <Button
              title="View related calls"
              variant="secondary"
              onPress={() => go("/admin/calls")}
            />
          </Row>
        </Card>
        <Notice>
          Role grants and privileged actions need server authorization. This
          page is not an authenticated admin service.
        </Notice>
      </>
    ) : (
      <Card>
        <Section
          title="Community directory"
          action={`${people.length} USERS`}
        />
        {people
          .filter(
            (p) =>
              p.name.toLowerCase().includes(query.toLowerCase()) &&
              (filter === "All" ||
                (filter === "Active" && !d.blocked.includes(p.id)) ||
                (filter === "Suspended" && d.blocked.includes(p.id))),
          )
          .map((p) => (
            <Setting
              key={p.id}
              title={p.name}
              detail={`${p.id} · ${d.blocked.includes(p.id) ? "Suspended" : "Active"} · ${p.city}`}
              icon="user"
              onPress={() => go(`/admin/users/${p.id}`)}
            />
          ))}
      </Card>
    );
  else if (page === "reports") {
    const reportItem = id
      ? d.safetyReports.find((r) => r.id === id) || {
          id,
          reporter_name: "Community Member",
          reported_user_id: "priya",
          reported_user_name: "Priya Patel",
          reason: "Spam concern",
          details: "Flagged repeated unwanted messages.",
          status: "Open" as const,
          resolution_note: null,
          created_at: new Date().toISOString(),
        }
      : null;
    content = reportItem ? (
      <Card>
        <Badge
          text={edit.Status || reportItem.status || "Open"}
          warning={reportItem.status === "Open"}
        />
        <T size={24} bold>
          Report {reportItem.id.slice(0, 8)}
        </T>
        <T color={c.secondary}>
          Reported user: {reportItem.reported_user_name} · Reason: {reportItem.reason}
        </T>
        <T color={c.secondary}>
          Reporter: {reportItem.reporter_name}
        </T>
        <T style={{ marginTop: 8 }}>
          {reportItem.details || "No additional text provided by reporter."}
        </T>
        {reportItem.resolution_note && (
          <Notice>Resolution note: {reportItem.resolution_note}</Notice>
        )}
        {field("Resolution note", reportItem.resolution_note || "")}
        <Chips
          items={["Open", "Under review", "Resolved", "Rejected"]}
          selected={edit.Status || reportItem.status || "Open"}
          onChange={(v) => setEdit((x) => ({ ...x, Status: v }))}
        />
        <Button
          title="Save report resolution"
          onPress={() => {
            const newStatus = (edit.Status || reportItem.status || "Resolved") as
              | "Open"
              | "Under review"
              | "Resolved"
              | "Rejected";
            d.resolveSafetyReport(reportItem.id, newStatus, edit["Resolution note"]);
            save(`Saved report resolution (${newStatus})`);
          }}
        />
        {action("Suspend reported user")}
      </Card>
    ) : (
      <Card>
        <Section
          title="Moderation queue"
          action={`${d.safetyReports.length} REPORTS`}
        />
        {d.safetyReports
          .filter(
            (r) =>
              r.reported_user_name.toLowerCase().includes(query.toLowerCase()) ||
              r.reason.toLowerCase().includes(query.toLowerCase())
          )
          .map((r) => (
            <Setting
              key={r.id}
              title={`${r.reason} · ${r.reported_user_name}`}
              detail={`${r.status} · Reporter: ${r.reporter_name}${r.details ? ` · "${r.details.slice(0, 40)}..."` : ""}`}
              icon="flag"
              onPress={() => go(`/admin/reports/${r.id}`)}
            />
          ))}
      </Card>
    );
  } else if (page === "calls")
    content = (
      <Card>
        <Section title="Call metadata" action={`${d.calls.length} SESSIONS`} />
        {d.calls
          .filter((x) =>
            `${x.person} ${x.status}`
              .toLowerCase()
              .includes(query.toLowerCase())
          )
          .map((x) => (
            <Setting
              key={x.id}
              title={`${x.person.toUpperCase()} · ${x.type.toUpperCase()} · ${x.status}`}
              detail={`${x.id} · ${x.seconds}s duration · ${x.incoming ? "Incoming" : "Outgoing"}`}
              icon="phone"
              onPress={() =>
                setNotice(
                  `${x.id}: ${x.type} call with ${x.person}; status ${x.status}; duration ${x.seconds} seconds. Sourced from Supabase.`
                )
              }
            />
          ))}
      </Card>
    );
  else if (page === "payments") {
    const rechargeTxs = d.transactions.filter((t) => t.kind === "Recharges");
    const paymentItem = id
      ? rechargeTxs.find((t) => t.id === id) || {
          id,
          title: "Wallet recharge (Razorpay)",
          amount: 500,
          kind: "Recharges",
          status: "Success",
          date: "Today, 2:40 PM",
        }
      : null;
    content = paymentItem ? (
      <Card>
        <T size={28} bold>
          Payment {paymentItem.id}
        </T>
        <Badge
          text={paymentItem.status}
          warning={paymentItem.status !== "Success"}
        />
        <Setting title="Amount" detail={`₹${paymentItem.amount} · INR`} icon="credit-card" />
        <Setting
          title="Provider"
          detail="Razorpay · Live Order reference"
          icon="shield"
        />
        <Setting
          title="Timestamp"
          detail={paymentItem.date}
          icon="clock"
        />
        {action("Recheck payment status")}
        {action("Request sample refund")}
        <Button
          title="Open reconciliation"
          variant="secondary"
          onPress={() => go("/admin/reconciliation")}
        />
      </Card>
    ) : (
      <Card>
        <Section
          title="Razorpay payments"
          action={`${rechargeTxs.length} TRANSACTIONS`}
        />
        {rechargeTxs
          .filter((x) => filter === "All" || filter === x.status)
          .map((x) => (
            <Setting
              key={x.id}
              title={`₹${x.amount} · ${x.status}`}
              detail={`${x.id} · ${x.date} · ${x.title}`}
              icon="credit-card"
              onPress={() => go(`/admin/payments/${x.id}`)}
            />
          ))}
      </Card>
    );
  }
  else if (page === "wallets")
    content = (
      <>
        <Card>
          <T size={24} bold>
            {id ? `Wallet · ${id}` : "Demo user wallet"}
          </T>
          <T size={38} bold>
            {money(d.balance)}
          </T>
          {d.transactions.map((x) => (
            <Setting
              key={x.id}
              title={`${x.title} · ${x.amount > 0 ? "+" : ""}${money(x.amount)}`}
              detail={`${x.id} · ${x.status}`}
              icon="file-text"
            />
          ))}
        </Card>
        <Card>
          <T size={20} bold>
            Ledger adjustment preview
          </T>
          {field("Signed amount (INR)")}
          {field("Adjustment reason")}
          {action("Submit adjustment")}
        </Card>
      </>
    );
  else if (page === "host-applications")
    content = (
      <>
        <Section title="Host applications" action="ADMIN REVIEW" />
        {d.hostStatus === "none" ? (
          <Empty
            icon="file-text"
            title="No pending applications"
            message="Submitted Host applications will appear here for review."
          />
        ) : (
          <Card>
            <Badge
              text={d.hostStatus === "pending" ? "Pending review" : "Approved"}
              warning={d.hostStatus === "pending"}
            />
            <T size={20} bold>
              {d.hostDraft.name || d.profile.name}
            </T>
            <T color={c.secondary}>
              {d.hostDraft.bio || "No Host bio provided."}
            </T>
            <T size={12} color={c.secondary}>
              Languages: {d.hostDraft.languages.join(", ") || "—"}
            </T>
            <T size={12} color={c.secondary}>
              Interests: {d.hostDraft.interests.join(", ") || "—"}
            </T>
            <T size={12} color={c.secondary}>
              Aadhaar: {d.hostDraft.aadhaarDocument || "Not uploaded"}
            </T>
            <T size={12} color={c.secondary}>
              PAN: {d.hostDraft.panDocument || "Not uploaded"}
            </T>
            {d.hostStatus === "pending" && (
              <Row>
                <Button
                  title="Approve Host"
                  style={{ flex: 1 }}
                  onPress={() => {
                    d.setHostStatus("approved");
                    save("Approved Host application");
                  }}
                />
                <Button
                  title="Reject"
                  variant="danger"
                  style={{ flex: 1 }}
                  onPress={() => {
                    d.setHostStatus("rejected");
                    save("Rejected Host application");
                  }}
                />
              </Row>
            )}
          </Card>
        )}
      </>
    );
  else if (page === "pricing")
    content = (
      <Card>
        <T size={24} bold>
          Call pricing
        </T>
        <T color={c.secondary}>
          Sample values. Changes do not affect an existing call’s rate snapshot.
        </T>
        {field("Audio rate per minute (INR)", "5")}
        {field("Video rate per minute (INR)", "10")}
        {field("Minimum balance (INR)", "20")}
        {field("Billing unit (seconds)", "60")}
        {field("Grace period (seconds)", "0")}
        {field("Effective date", "2026-09-14")}
        {action("Publish pricing")}
      </Card>
    );
  else if (page === "settings")
    content = (
      <Card>
        <T size={24} bold>
          App configuration
        </T>
        <Notice>
          Configuration loaded from Supabase app_policies_and_settings table.
        </Notice>
        <Setting
          title="Paid-call UI enabled"
          value={d.paid}
          onToggle={d.setPaid}
          icon="credit-card"
        />
        <Setting
          title="Later rating preview enabled"
          value={d.later}
          onToggle={d.setLater}
          icon="star"
        />
        <Setting
          title="Support Email"
          detail={d.appConfig?.support_email || "support@talkative.app"}
          icon="mail"
        />
        <Setting
          title="Support Phone"
          detail={d.appConfig?.support_phone || "+91 98765 43210"}
          icon="phone"
        />
        <Setting
          title="Minimum App Version"
          detail={d.appConfig?.minimum_app_version || "1.0.0"}
          icon="shield"
        />
        <Setting
          title="New User Bonus"
          detail={`${d.appConfig?.new_user_bonus_coins || 100} coins`}
          icon="gift"
        />
        <Setting
          title="Maintenance Mode"
          detail={d.appConfig?.maintenance_mode ? "Active" : "Disabled (Online)"}
          icon="tool"
        />
        {action("Save app settings")}
      </Card>
    );
  else if (page === "announcements")
    content = (
      <>
        <Card>
          <T size={24} bold>
            Publish community update
          </T>
          <T color={c.secondary}>
            Announcements are stored in Supabase and broadcasted to all users.
          </T>
          {field("Announcement title")}
          {field("Message")}
          {field("Audience", "All users")}
          <Card style={{ backgroundColor: c.high }}>
            <T bold>{edit["Announcement title"] || "Announcement preview"}</T>
            <T color={c.secondary}>
              {edit.Message || "Your message will appear here."}
            </T>
          </Card>
          <Button
            title="Publish to Supabase"
            disabled={!edit["Announcement title"] || !edit.Message}
            onPress={() => {
              d.submitAnnouncement(
                edit["Announcement title"],
                edit.Message,
                edit.Audience || "All users"
              );
              save(`Published announcement: "${edit["Announcement title"]}"`);
              setEdit((x) => ({ ...x, "Announcement title": "", Message: "" }));
            }}
          />
        </Card>
        <Card>
          <Section
            title="Live announcements"
            action={`${d.announcements.length} ACTIVE`}
          />
          {d.announcements.map((a) => (
            <Setting
              key={a.id}
              title={a.title}
              detail={`[${a.tag}] ${a.message} · Audience: ${a.audience}`}
              icon="radio"
            />
          ))}
        </Card>
      </>
    );
  else if (page === "audit")
    content = (
      <Card>
        <Section title="Audit log" />
        {[
          ...audit,
          "Pricing reviewed · demo admin · Today 14:32",
          "Report resolved · demo moderator · Today 13:18",
          "Reconciliation checked · demo admin · Today 12:10",
        ]
          .filter((x) => x.toLowerCase().includes(query.toLowerCase()))
          .map((x, i) => (
            <Setting
              key={i}
              title={x}
              detail="Read-only illustrative audit entry"
              icon="file-text"
            />
          ))}
      </Card>
    );
  else
    content = (
      <>
        <Row style={{ flexWrap: "wrap" }}>
          {[
            ["Razorpay total", "₹24,500"],
            ["Ledger credits", "₹24,000"],
            ["Unmatched amount", "₹500"],
          ].map(([a, b]) => (
            <Card key={a} style={{ flex: 1, minWidth: 180 }}>
              <T color={c.secondary}>{a}</T>
              <T bold size={28}>
                {b}
              </T>
            </Card>
          ))}
        </Row>
        <Card>
          <Badge text="1 sample discrepancy" warning />
          <T size={22} bold>
            Payment received, credit pending
          </T>
          <T color={c.secondary}>
            demo_order_1 · ₹500 · waiting for a verified ledger event
          </T>
          {action("Retry reconciliation")}
          <Button
            title="Inspect payment"
            variant="secondary"
            onPress={() => go("/admin/payments/demo-1")}
          />
        </Card>
      </>
    );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flex: 1, flexDirection: wide ? "row" : "column" }}>
        {wide && (
          <View
            style={{
              width: 240,
              padding: 22,
              backgroundColor: c.deep,
              gap: 28,
            }}
          >
            <Row>
              <AasaiTalkMark size={24} />
              <T size={22} bold>
                Aasai Talk
              </T>
            </Row>
            <T mono size={10} color={c.muted}>
              COMMUNITY OPERATIONS
            </T>
            <ScrollView>
              {nav.map(([label, key]) => (
                <Pressable
                  key={key}
                  onPress={() => router.replace(`/admin/${key}` as never)}
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    marginBottom: 5,
                    backgroundColor: page === key ? c.high : "transparent",
                  }}
                >
                  <T
                    color={page === key ? c.mint : c.secondary}
                    bold={page === key}
                  >
                    {label}
                  </T>
                </Pressable>
              ))}
            </ScrollView>
            <Button
              title="Mobile preview"
              variant="secondary"
              onPress={() => go("/explore")}
            />
            <Button
              title="Sign out preview"
              variant="secondary"
              onPress={() => go("/admin/login")}
            />
          </View>
        )}
        <ScrollView
          contentContainerStyle={{
            padding: wide ? 36 : 20,
            gap: 24,
            width: "100%",
            maxWidth: 1352,
            alignSelf: "center",
          }}
        >
          <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <View>
              <T mono size={11} color={c.mint}>
                ASAI TALK / ADMIN PREVIEW
              </T>
              <T size={34} bold>
                {title}
                {id ? " / Detail" : ""}
              </T>
            </View>
            <Badge text="ADMIN ACCESS" warning />
          </Row>
          {!wide && (
            <Chips
              items={nav.map((x) => x[0])}
              selected={title}
              onChange={(v) => go(`/admin/${nav.find((x) => x[0] === v)![1]}`)}
            />
          )}
          <T color={c.secondary}>
            Keep the community connected, supported, and running smoothly.
          </T>
          <Row style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Field
                label="Search this view"
                value={query}
                onChange={setQuery}
                placeholder="Search name, reference, or action"
              />
            </View>
            <Chips
              items={
                page === "users"
                  ? ["All", "Active", "Suspended"]
                  : page === "payments"
                    ? ["All", "Pending", "Success", "Failed", "Refunded"]
                    : ["All", "Today", "7 days", "30 days"]
              }
              selected={filter}
              onChange={(v) => {
                setFilter(v);
                if (page !== "users" && page !== "payments")
                  setNotice(
                    `${v} selected. This preview uses a fixed illustrative dataset.`,
                  );
              }}
            />
          </Row>
          {notice && <Notice>{notice}</Notice>}
          {confirm && (
            <Card
              style={{
                backgroundColor: c.successSurface,
                borderWidth: 1,
                borderColor: c.mint,
              }}
            >
              <T bold size={22}>
                Confirm: {confirm}
              </T>
              <Field
                label="Reason for this demo action"
                value={reason}
                onChange={setReason}
              />
              <Notice>
                This is a local interaction preview. No messages, refunds or
                account changes will be sent to external services.
              </Notice>
              <Row>
                <Button
                  title="Confirm preview"
                  disabled={!reason.trim()}
                  onPress={() => {
                    if (confirm === "Suspend user" && id)
                      d.setBlocked((v) => [...new Set([...v, id])]);
                    if (confirm === "Restore user" && id)
                      d.setBlocked((v) => v.filter((x) => x !== id));
                    save(confirm);
                  }}
                />
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setConfirm("")}
                />
              </Row>
            </Card>
          )}
          {content}
          {!!audit.length && (
            <Card>
              <T bold>Actions in this preview</T>
              {audit.map((x, i) => (
                <T key={i} size={12} color={c.secondary}>
                  {x}
                </T>
              ))}
            </Card>
          )}
          <T size={11} color={c.muted}>
            Admin interface preview · responsive web layout · no production
            authorization.{" "}
            {Platform.OS !== "web"
              ? "Open this route on web for the full desktop workspace."
              : ""}
          </T>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
