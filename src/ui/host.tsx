import { useAuth } from "@/data/auth";
import { submitPhoneHostApplication } from "@/data/host-applications";
import { uploadHostVerificationDocument } from "@/data/host-documents";
import { fetchPhoneHostDashboard, type HostDashboard } from "@/data/host-dashboard";
import { fetchHostPayoutStatus, requestHostWithdrawal, saveHostPayoutAccount, type HostPayoutAccount, type HostWithdrawal } from "@/data/host-payouts";
import { fetchHostDailyCallSummary, fetchHostDailyCallTime, type HostDailyCallSummary } from "@/data/host-metrics";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import {
    Button,
    Card,
    Chip,
    Chips,
    Field,
    Icon,
    Notice,
    Row,
    Setting,
    Shell,
    T,
} from "./components";
import { PhotoPicker } from "./photo-picker";
import { useDemo } from "./store";
import { colors as c } from "./theme";

const hostDate = (value: string) => {
  const parsed = new Date(value.includes("T") ? value : `${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

type PayoutAlertTone = "review" | "processing" | "success" | "info" | "error";

function PayoutAlert({ tone, title, children }: { tone: PayoutAlertTone; title: string; children: React.ReactNode }) {
  const style = {
    review: { background: "#fff8df", border: "#f0d28a", accent: "#a56500", icon: "clock" as const },
    processing: { background: "#edf8f4", border: "#b9e4d2", accent: "#087f5b", icon: "shield" as const },
    success: { background: "#edfbf3", border: "#a7e3c2", accent: "#087f5b", icon: "check-circle" as const },
    info: { background: "#eef4ff", border: "#bdd0f7", accent: "#315aa7", icon: "info" as const },
    error: { background: "#fff0f1", border: "#f4c0c7", accent: c.error, icon: "alert-circle" as const },
  }[tone];
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: style.background, borderWidth: 1, borderColor: style.border, borderLeftWidth: 5, borderLeftColor: style.accent, borderRadius: 18, padding: 15, gap: 8 }}>
      <Row style={{ alignItems: "flex-start" }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: `${style.accent}18`, alignItems: "center", justifyContent: "center" }}>
          <Icon name={style.icon} size={17} color={style.accent} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <T bold size={14} color={style.accent}>{title}</T>
          <T size={12} color={c.secondary}>{children}</T>
        </View>
      </Row>
    </View>
  );
}

function DocumentUpload({
  label,
  kind,
  fileName,
  onChange,
  getIdentityToken,
}: {
  label: string;
  kind: "aadhaar" | "pan";
  fileName: string;
  onChange: (document: { name: string; path: string }) => void;
  getIdentityToken: () => Promise<string>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choose = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const document = await uploadHostVerificationDocument(
          await getIdentityToken(),
          kind,
          asset.uri,
          asset.name,
        );
        onChange(document);
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload this document. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <T bold>{label}</T>
      <T size={12} color={c.secondary}>
        Upload a clear photo or PDF. Your document is only for verification.
      </T>
      {fileName ? (
        <Notice>{fileName} selected</Notice>
      ) : (
        <Button
          title={busy ? "Opening files…" : `Upload ${label}`}
          icon="upload"
          variant="secondary"
          disabled={busy}
          onPress={() => void choose()}
        />
      )}
      {fileName ? (
        <Button
          title="Replace document"
          variant="secondary"
          disabled={busy}
          onPress={() => void choose()}
        />
      ) : null}
      {error ? <Notice error>{error}</Notice> : null}
    </Card>
  );
}

const titles = [
  "Become an Aasai Talk Host",
  "Your Host profile",
  "Languages",
  "Interests",
  "Call preferences",
  "Verification",
  "Review application",
];
export function HostApplication() {
  const d = useDemo();
  const auth = useAuth();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const form = d.hostDraft;
  const update = (value: Partial<typeof form>) => {
    d.setHostDraft({ ...form, ...value });
    setError("");
  };
  if (d.profile.gender !== "Female")
    return (
      <Shell title="Host application">
        <Notice>
          Host applications are available to women only under the current Aasai
          Talk product rule.
        </Notice>
        <Button
          title="Back to settings"
          variant="secondary"
          onPress={() => router.replace("/settings")}
        />
      </Shell>
    );
  function next() {
    if (step === 1 && (!form.name.trim() || !form.bio.trim()))
      return setError("Enter a display name and short bio.");
    if (step === 2 && !form.languages.length)
      return setError("Choose at least one language.");
    if (step === 3 && !form.interests.length)
      return setError("Choose at least one interest.");
    if (step === 4 && !form.audio && !form.video)
      return setError("Enable at least one call type.");
    if (step === 5 && (!form.aadhaarDocument || !form.panDocument))
      return setError("Upload both Aadhaar and PAN documents to continue.");
    setError("");
    setStep(step + 1);
  }
  return (
    <Shell title={titles[step]}>
      <T>
        Step {step + 1} of {titles.length}
      </T>
      {step === 0 && (
        <Card>
          <T size={22} bold>
            Talk with people and earn.
          </T>
          <T>
            Complete your profile and apply for review. Host features become
            available only after admin approval.
          </T>
        </Card>
      )}
      {step === 1 && (
        <>
          <PhotoPicker uri={d.photo} onChange={d.setPhoto} />
          <Field
            label="Display name"
            value={form.name}
            onChange={(name) => update({ name })}
          />
          <Field
            label="Short bio"
            multiline
            value={form.bio}
            onChange={(bio) => update({ bio })}
          />
        </>
      )}
      {(step === 2 || step === 3) && (
        <Row style={{ flexWrap: "wrap" }}>
          {(step === 2
            ? [
                "English",
                "Tamil",
                "Hindi",
                "Telugu",
                "Malayalam",
                "Kannada",
                "Bengali",
                "Other",
              ]
            : [
                "Music",
                "Movies",
                "Travel",
                "Gaming",
                "Food",
                "Sports",
                "Fitness",
                "Fashion",
                "Books",
                "Comedy",
                "Technology",
              ]
          ).map((item) => {
            const key = step === 2 ? "languages" : "interests";
            return (
              <Chip
                key={item}
                title={item}
                selected={form[key].includes(item)}
                onPress={() =>
                  update({
                    [key]: form[key].includes(item)
                      ? form[key].filter((x) => x !== item)
                      : [...form[key], item],
                  })
                }
              />
            );
          })}
        </Row>
      )}
      {step === 4 && (
        <>
          <Setting
            title="Audio calls"
            value={form.audio}
            onToggle={(audio) => update({ audio })}
          />
          <Setting
            title="Video calls"
            value={form.video}
            onToggle={(video) => update({ video })}
          />
        </>
      )}
      {step === 5 && (
        <>
          <Notice>
            Your documents are required for Host verification. They are used by
            authorized reviewers only and are never shown publicly.
          </Notice>
          <DocumentUpload
            label="Aadhaar card"
            kind="aadhaar"
            fileName={form.aadhaarDocument}
            getIdentityToken={auth.getIdentityToken}
            onChange={({ name, path }) =>
              update({ aadhaarDocument: name, aadhaarPath: path })
            }
          />
          <DocumentUpload
            label="PAN card"
            kind="pan"
            fileName={form.panDocument}
            getIdentityToken={auth.getIdentityToken}
            onChange={({ name, path }) =>
              update({ panDocument: name, panPath: path })
            }
          />
        </>
      )}
      {step === 6 && (
        <Card>
          <T bold>{form.name}</T>
          <T>{form.bio}</T>
          <T>{form.languages.join(", ")}</T>
          <T>{form.interests.join(", ")}</T>
          <T color={c.secondary}>
            Your earnings depend on the time you spend in calls each day.
          </T>
          <Button
            title="Submit"
            onPress={() => {
              if (!auth.demoPhone) {
                setError("Please sign in again before submitting your application.");
                return;
              }
              void auth
                .getIdentityToken()
                .then((token) =>
                  submitPhoneHostApplication(
                    auth.demoPhone!,
                    { ...form, photo: d.photo || undefined },
                    token,
                  ),
                )
                .then(({ photo }) => {
                  if (photo) d.setPhoto(photo);
                  d.setHostStatus("pending");
                  router.replace("/host/status");
                })
                .catch((submitError) => {
                  console.error("Failed to submit host application:", submitError);
                  if (d.photo && !/^https:\/\//i.test(d.photo)) d.setPhoto("");
                  setError(
                    submitError instanceof Error
                      ? submitError.message
                      : "We could not submit your Host application. Please try again.",
                  );
                });
            }}
          />
        </Card>
      )}
      {!!error && <Notice error>{error}</Notice>}
      {step < 7 && (
        <Button
          title={step === 6 ? "Review draft" : "Continue"}
          onPress={next}
        />
      )}
      {step > 0 && (
        <Button
          title="Back"
          variant="secondary"
          onPress={() => {
            setStep(step - 1);
            setError("");
          }}
        />
      )}
      <Button
        title={step === 0 ? "Maybe later" : "Close"}
        variant="secondary"
        onPress={() => router.replace("/settings")}
      />
    </Shell>
  );
}

export function HostStatus() {
  const d = useDemo();
  const auth = useAuth();
  const approved = d.hostStatus === "approved";
  const [refreshing, setRefreshing] = useState(false);
  const [dailyCallTime, setDailyCallTime] = useState<{ seconds: number; calls: number } | null>(null);
  const [dailySummary, setDailySummary] = useState<HostDailyCallSummary[]>([]);
  const [dailyCallTimeError, setDailyCallTimeError] = useState("");
  const loadDailyCallTime = async () => {
    if (!auth.demoPhone) return;
    try {
      const result = await fetchHostDailyCallTime(auth.demoPhone);
      setDailyCallTime(result);
      setDailySummary(await fetchHostDailyCallSummary(auth.demoPhone));
      setDailyCallTimeError("");
    } catch (error) {
      setDailyCallTimeError(error instanceof Error ? error.message : "Unable to load today's call time.");
    }
  };
  const refreshStatus = async () => {
    setRefreshing(true);
    try {
      await d.refreshUserData();
      await loadDailyCallTime();
    } catch (error) {
      console.error("Failed to refresh Host application status:", error);
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    if (approved) void loadDailyCallTime();
  }, [approved, auth.demoPhone]);
  return (
    <Shell
      title="Host application"
      refreshing={refreshing}
      onRefresh={refreshStatus}
    >
      <Card>
        <T size={22} bold>
          {approved ? "Host application approved" : "Application submitted"}
        </T>
        <T color={c.secondary}>
          {approved
            ? "You can now use Host availability, calls, earnings, and withdrawals."
            : "Your Host application is under review. This usually takes 2–3 days."}
        </T>
        <Notice>{approved ? "APPROVED" : "PENDING REVIEW"}</Notice>
      </Card>
      <Card style={{ padding: 14 }}>
        <T mono size={10} color={c.secondary}>HOST CHECKLIST</T>
        <Setting title="Application" detail={approved ? "Approved" : "Under review"} icon={approved ? "check-circle" : "clock"} />
        <Setting title="Verification documents" detail="Submitted securely" icon="file-text" />
        <Setting title="Payout destination" detail={approved ? "Add and verify a bank account or UPI ID" : "Available after approval"} icon="credit-card" onPress={approved ? () => router.push("/host/withdraw") : undefined} />
      </Card>
      {!approved && (
        <T size={12} color={c.secondary}>
          Host availability, call controls, earnings, and withdrawals appear
          only after an administrator approves the application.
        </T>
      )}
      {approved && (
        <Card>
          <T size={12} color={c.secondary}>TODAY'S HOST CALL TIME</T>
          <T size={30} bold>
            {dailyCallTime
              ? `${Math.floor(dailyCallTime.seconds / 3600)}h ${Math.floor((dailyCallTime.seconds % 3600) / 60)}m`
              : "Loading…"}
          </T>
          <T color={c.secondary}>
            {dailyCallTime ? `${dailyCallTime.calls} connected call${dailyCallTime.calls === 1 ? "" : "s"} today` : "Loading call activity…"}
          </T>
          {dailyCallTimeError ? <Notice error>{dailyCallTimeError}</Notice> : null}
          <T bold style={{ marginTop: 14 }}>Daily history</T>
          {dailySummary.filter((item) => item.seconds || item.calls).map((item) => (
            <Row key={item.date} style={{ justifyContent: "space-between" }}>
              <T>{hostDate(item.date)}</T>
              <T color={c.secondary}>
                {Math.floor(item.seconds / 3600)}h {Math.floor((item.seconds % 3600) / 60)}m · {item.calls} call{item.calls === 1 ? "" : "s"}
              </T>
            </Row>
          ))}
        </Card>
      )}
      <Button title="Done" onPress={() => router.replace("/settings")} />
    </Shell>
  );
}

export function HostWithdrawals({ preview = false }: { preview?: boolean }) {
  const d = useDemo();
  const auth = useAuth();
  const [dashboard, setDashboard] = useState<HostDashboard | null>(null);
  const [earningsError, setEarningsError] = useState("");
  const [payoutAccount, setPayoutAccount] = useState<HostPayoutAccount | null>(null);
  const [withdrawals, setWithdrawals] = useState<HostWithdrawal[]>([]);
  const [accountHolderName, setAccountHolderName] = useState("");
  const [payoutMethod, setPayoutMethod] = useState<"bank" | "upi">("bank");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [upiId, setUpiId] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState("");
  const loadPayouts = async () => {
    const idToken = await auth.getIdentityToken();
    const payout = await fetchHostPayoutStatus(idToken);
    setPayoutAccount(payout.payout_account);
    setWithdrawals(payout.withdrawals);
  };
  const previewMode = preview && d.hostStatus === "pending";
  useEffect(() => {
    if (!auth.demoPhone || d.hostStatus !== "approved") return;
    let active = true;
    const refresh = () => void Promise.all([fetchPhoneHostDashboard(auth.demoPhone!), loadPayouts()])
      .then(([nextDashboard]) => { if (active) setDashboard(nextDashboard); })
      .catch((error) => { if (active) setEarningsError(error instanceof Error ? error.message : "Unable to load host earnings."); });
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [auth.demoPhone, d.hostStatus]);
  const availableEarnings = dashboard ? dashboard.total_earnings_paise / 100 : 0;
  const requestedWithdrawalAmount = Number(withdrawalAmount);
  const hasValidWithdrawalAmount = /^\d+(?:\.\d{1,2})?$/.test(withdrawalAmount.trim())
    && Number.isFinite(requestedWithdrawalAmount)
    && requestedWithdrawalAmount >= 100
    && requestedWithdrawalAmount <= availableEarnings;
  const activeWithdrawal = withdrawals.find((item) => ["pending", "in_review", "processing"].includes(item.status));
  if (d.hostStatus !== "approved" && !previewMode)
    return (
      <Shell title="Host earnings">
        <Notice>
          Withdrawals unlock after your Host application is approved.
        </Notice>
        <Button
          title="View application status"
          variant="secondary"
          onPress={() => router.replace("/host/status")}
        />
      </Shell>
    );
  return (
    <Shell title="Host earnings">
      {previewMode && <Notice>Your application is pending review.</Notice>}
      <Card style={{ backgroundColor: "#2a1b37", borderWidth: 1, borderColor: "#493056", padding: 22, gap: 16, overflow: "hidden" }}>
        <View style={{ position: "absolute", width: 180, height: 180, borderRadius: 90, right: -70, top: -70, backgroundColor: "#ffffff0d" }} />
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ gap: 5 }}>
            <T mono size={10} bold color="#d9c7e6">YOUR AVAILABLE EARNINGS</T>
            <T size={34} bold color="#ffffff">{dashboard ? `₹${availableEarnings.toLocaleString("en-IN")}` : "Loading…"}</T>
            <T size={12} color="#e5d8ed">Ready for you to withdraw</T>
          </View>
          <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff18", borderWidth: 1, borderColor: "#ffffff30" }}><Icon name="credit-card" size={23} color="#ffd49a" /></View>
        </Row>
        <View style={{ alignSelf: "flex-start", paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: "#ffffff14" }}><T size={11} bold color="#ffffff">Minimum withdrawal · ₹100</T></View>
      </Card>
      {payoutAccount && (
        <Card style={{ padding: 14 }}>
          <T mono size={10} color={c.secondary}>PAYOUT STATUS</T>
          <Setting title={`${payoutAccount.payout_method === "upi" ? "UPI ID" : "Bank account"} verification`} detail={payoutAccount.status === "verified" ? "Verified" : payoutAccount.status === "rejected" ? "Action needed" : "In review"} icon={payoutAccount.status === "verified" ? "check-circle" : "clock"} />
          <Setting title="Withdrawal requests" detail={withdrawals.length ? `${withdrawals.filter((item) => ["pending", "in_review", "processing"].includes(item.status)).length} in progress` : "No requests yet"} icon="credit-card" />
        </Card>
      )}
      <T size={19} bold>Withdraw your earnings</T>
      {earningsError ? <PayoutAlert tone="error" title="We couldn’t load your earnings">{earningsError}</PayoutAlert> : null}
      {activeWithdrawal?.status === "pending" && (
        <PayoutAlert tone="review" title="Withdrawal request under review">Your ₹{(activeWithdrawal.amount_paise / 100).toLocaleString("en-IN")} request is being reviewed. Manual payouts are usually completed within 2–3 business days. Your earnings are safely reserved, so please don’t submit another request.</PayoutAlert>
      )}
      {activeWithdrawal?.status === "in_review" && (
        <PayoutAlert tone="processing" title="Your withdrawal is being checked">Our team is checking the details for your ₹{(activeWithdrawal.amount_paise / 100).toLocaleString("en-IN")} request. We’ll update you once the payment has been sent.</PayoutAlert>
      )}
      {activeWithdrawal?.status === "processing" && (
        <PayoutAlert tone="processing" title="Your withdrawal is being processed">We are preparing your ₹{(activeWithdrawal.amount_paise / 100).toLocaleString("en-IN")} manual payout. The status will update once the transfer is completed.</PayoutAlert>
      )}
      {!payoutAccount ? <Card>
        <T bold size={17}>Add your payout destination</T>
        <T size={12} color={c.secondary}>Choose a bank account or UPI ID. Your details stay private and must be verified before you can withdraw earnings.</T>
        <Chips items={["Bank account", "UPI ID"]} selected={payoutMethod === "bank" ? "Bank account" : "UPI ID"} onChange={(value) => setPayoutMethod(value === "UPI ID" ? "upi" : "bank")} />
        <Field label="Account holder name" value={accountHolderName} onChange={setAccountHolderName} placeholder="Name shown on the payout destination" />
        {payoutMethod === "bank" ? <>
          <Field label="Bank account number" value={accountNumber} onChange={setAccountNumber} placeholder="Enter account number" numeric secure />
          <Field label="Re-enter account number" value={confirmAccountNumber} onChange={setConfirmAccountNumber} placeholder="Enter account number again" numeric secure error={confirmAccountNumber && accountNumber !== confirmAccountNumber ? "Account numbers do not match." : undefined} />
          <Field label="IFSC code" value={ifscCode} onChange={(value) => setIfscCode(value.toUpperCase())} placeholder="Example: HDFC0001234" />
        </> : <>
          <Field label="UPI ID" value={upiId} onChange={(value) => setUpiId(value.trim().toLowerCase())} placeholder="Example: name@bank" />
          <PayoutAlert tone="info" title="Verification is required">Your UPI ID will be checked by our team before your first withdrawal.</PayoutAlert>
        </>}
        <Button title={busy ? "Saving…" : `Save ${payoutMethod === "upi" ? "UPI ID" : "bank account"}`} disabled={busy || !accountHolderName.trim() || (payoutMethod === "bank" ? (!accountNumber || accountNumber !== confirmAccountNumber || !ifscCode) : !upiId)} onPress={() => {
          setBusy(true); setPayoutMessage("");
          void auth.getIdentityToken().then((token) => saveHostPayoutAccount(token, { accountHolderName, payoutMethod, accountNumber, ifscCode, upiId }))
            .then(() => loadPayouts()).then(() => setPayoutMessage(`${payoutMethod === "upi" ? "UPI ID" : "Bank account"} submitted for verification.`))
            .catch((error) => setPayoutMessage(error instanceof Error ? error.message : "Unable to save payout destination."))
            .finally(() => setBusy(false));
        }} />
      </Card> : <Card>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ gap: 3, flex: 1 }}>
            <T bold>{payoutAccount.account_holder_name}</T>
            <T size={12} color={c.secondary}>{payoutAccount.payout_method === "upi" ? payoutAccount.masked_upi_id : `${payoutAccount.masked_account_number} · ${payoutAccount.ifsc_code}`}</T>
          </View>
          <Chip title={payoutAccount.status === "verified" ? "Verified" : payoutAccount.status === "rejected" ? "Needs update" : "Verification pending"} />
        </Row>
        {payoutAccount.status === "verified" ? <PayoutAlert tone="success" title="Payout destination verified">Withdrawals will be sent only to this verified {payoutAccount.payout_method === "upi" ? "UPI ID" : "bank account"}.</PayoutAlert> : payoutAccount.status === "rejected" ? <PayoutAlert tone="error" title="Payout details need correction">{payoutAccount.verification_note || "Please correct your payout details and submit them again for verification."}</PayoutAlert> : <PayoutAlert tone="review" title="Payout destination under review">Your payout details are locked while our team reviews them. Withdrawals unlock after verification, and we’ll notify you once it is complete.</PayoutAlert>}
        {payoutAccount.status !== "pending_verification" && <Button title={payoutAccount.status === "rejected" ? "Correct payout destination" : "Change payout destination"} variant="secondary" onPress={() => { setPayoutAccount(null); setPayoutMethod(payoutAccount.payout_method); setAccountNumber(""); setConfirmAccountNumber(""); setIfscCode(payoutAccount.ifsc_code || ""); setUpiId(""); setAccountHolderName(payoutAccount.account_holder_name); }} />}
      </Card>}
      {payoutMessage ? <PayoutAlert tone={/unable|invalid|match|failed|couldn’t/i.test(payoutMessage) ? "error" : "success"} title={/submitted|completed/i.test(payoutMessage) ? "Request submitted" : "Payout update"}>{payoutMessage}</PayoutAlert> : null}
      {payoutAccount?.status === "verified" && <Card>
        <T bold size={18}>How much would you like to withdraw?</T>
        <T size={12} color={c.secondary}>Enter the amount you want to receive. You can withdraw from ₹100 onwards.</T>
        <Field label="How much would you like to withdraw? (₹)" value={withdrawalAmount} onChange={setWithdrawalAmount} placeholder="Example: 500" numeric error={withdrawalAmount && !hasValidWithdrawalAmount ? requestedWithdrawalAmount < 100 ? "Minimum withdrawal is ₹100." : requestedWithdrawalAmount > availableEarnings ? "This is more than your available earnings." : "Enter a valid amount, up to two decimal places." : undefined} />
        <T size={12} color={c.secondary}>Available to withdraw: ₹{availableEarnings.toLocaleString("en-IN")}</T>
        <PayoutAlert tone="info" title="What happens next">Once you send your request, our team will check it and send your earnings within 2–3 business days.</PayoutAlert>
        <Button title={busy ? "Sending request…" : hasValidWithdrawalAmount ? `Request ₹${requestedWithdrawalAmount.toLocaleString("en-IN")}` : "Enter an amount to continue"} disabled={busy || !hasValidWithdrawalAmount} onPress={() => {
          setBusy(true); setPayoutMessage("");
          void auth.getIdentityToken().then((token) => requestHostWithdrawal(token, Math.round(requestedWithdrawalAmount * 100)))
            .then(() => Promise.all([fetchPhoneHostDashboard(auth.demoPhone!), loadPayouts()]))
            .then(([nextDashboard]) => { setDashboard(nextDashboard); setWithdrawalAmount(""); setPayoutMessage("Withdrawal request submitted for review."); })
            .catch((error) => setPayoutMessage(error instanceof Error ? error.message : "Unable to request withdrawal."))
            .finally(() => setBusy(false));
        }} />
      </Card>}
      {withdrawals.length > 0 && <Card>
        <T bold size={16}>Withdrawal history</T>
        {withdrawals.map((withdrawal) => <Row key={withdrawal.id} style={{ justifyContent: "space-between" }}>
          <View><T bold>₹{(withdrawal.amount_paise / 100).toLocaleString("en-IN")}</T><T size={11} color={c.secondary}>{hostDate(withdrawal.created_at)}</T></View>
          <Chip title={withdrawal.status === "in_review" ? "In review" : withdrawal.status === "completed" ? "Amount sent" : withdrawal.status === "pending" ? "Pending" : withdrawal.status} />
        </Row>)}
      </Card>}
    </Shell>
  );
}
