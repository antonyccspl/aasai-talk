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
    Field,
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
        <Setting title="Bank account & payouts" detail={approved ? "Add and verify bank details" : "Available after approval"} icon="credit-card" onPress={approved ? () => router.push("/host/withdraw") : undefined} />
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
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
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
    void Promise.all([fetchPhoneHostDashboard(auth.demoPhone), loadPayouts()])
      .then(([nextDashboard]) => setDashboard(nextDashboard))
      .catch((error) => setEarningsError(error instanceof Error ? error.message : "Unable to load host earnings."));
  }, [auth.demoPhone, d.hostStatus]);
  const availableEarnings = dashboard ? dashboard.total_earnings_paise / 100 : 0;
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
      <Card>
        <T size={12} color={c.secondary}>
          AVAILABLE HOST EARNINGS
        </T>
        <T size={30} bold>
          {dashboard ? `₹${availableEarnings.toLocaleString("en-IN")}` : "Loading…"}
        </T>
        <T size={12} color={c.secondary}>
          Minimum withdrawal: ₹100
        </T>
      </Card>
      {payoutAccount && (
        <Card style={{ padding: 14 }}>
          <T mono size={10} color={c.secondary}>PAYOUT STATUS</T>
          <Setting title="Bank verification" detail={payoutAccount.status === "verified" ? "Verified" : payoutAccount.status === "rejected" ? "Action needed" : "In review"} icon={payoutAccount.status === "verified" ? "check-circle" : "clock"} />
          <Setting title="Withdrawal requests" detail={withdrawals.length ? `${withdrawals.filter((item) => ["pending", "processing"].includes(item.status)).length} in progress` : "No requests yet"} icon="credit-card" />
        </Card>
      )}
      <T size={18} bold>Withdraw earnings</T>
      {earningsError ? <Notice error>{earningsError}</Notice> : null}
      {!payoutAccount ? <Card>
        <T bold size={17}>Add your bank account</T>
        <T size={12} color={c.secondary}>Your account details are kept private and must be verified before you can withdraw earnings.</T>
        <Field label="Account holder name" value={accountHolderName} onChange={setAccountHolderName} placeholder="Name as shown on the bank account" />
        <Field label="Bank account number" value={accountNumber} onChange={setAccountNumber} placeholder="Enter account number" numeric secure />
        <Field label="Re-enter account number" value={confirmAccountNumber} onChange={setConfirmAccountNumber} placeholder="Enter account number again" numeric secure error={confirmAccountNumber && accountNumber !== confirmAccountNumber ? "Account numbers do not match." : undefined} />
        <Field label="IFSC code" value={ifscCode} onChange={(value) => setIfscCode(value.toUpperCase())} placeholder="Example: HDFC0001234" />
        <Button title={busy ? "Saving…" : "Save bank account"} disabled={busy || !accountHolderName.trim() || !accountNumber || accountNumber !== confirmAccountNumber || !ifscCode} onPress={() => {
          setBusy(true); setPayoutMessage("");
          void auth.getIdentityToken().then((token) => saveHostPayoutAccount(token, { accountHolderName, accountNumber, ifscCode }))
            .then(() => loadPayouts()).then(() => setPayoutMessage("Bank account submitted for verification."))
            .catch((error) => setPayoutMessage(error instanceof Error ? error.message : "Unable to save bank account."))
            .finally(() => setBusy(false));
        }} />
      </Card> : <Card>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ gap: 3, flex: 1 }}>
            <T bold>{payoutAccount.account_holder_name}</T>
            <T size={12} color={c.secondary}>{payoutAccount.masked_account_number} · {payoutAccount.ifsc_code}</T>
          </View>
          <Chip title={payoutAccount.status === "verified" ? "Verified" : payoutAccount.status === "rejected" ? "Needs update" : "Verification pending"} />
        </Row>
        {payoutAccount.status === "verified" ? <T size={12} color={c.secondary}>Withdrawals are sent only to this verified account.</T> : <Notice error={payoutAccount.status === "rejected"}>{payoutAccount.verification_note || "Our team will verify these bank details before withdrawals are enabled."}</Notice>}
        <Button title="Update bank account" variant="secondary" onPress={() => { setPayoutAccount(null); setAccountNumber(""); setConfirmAccountNumber(""); setIfscCode(payoutAccount.ifsc_code); setAccountHolderName(payoutAccount.account_holder_name); }} />
      </Card>}
      {payoutMessage ? <Notice error={/unable|invalid|match/i.test(payoutMessage)}>{payoutMessage}</Notice> : null}
      {payoutAccount?.status === "verified" && <Card>
        <T bold size={16}>Request a withdrawal</T>
        <Field label="Amount in rupees" value={withdrawalAmount} onChange={setWithdrawalAmount} placeholder="Minimum ₹100" numeric />
        <T size={12} color={c.secondary}>Available to withdraw: ₹{availableEarnings.toLocaleString("en-IN")}</T>
        <Button title={busy ? "Submitting…" : "Request withdrawal"} disabled={busy || !withdrawalAmount || Number(withdrawalAmount) < 100 || Number(withdrawalAmount) > availableEarnings} onPress={() => {
          setBusy(true); setPayoutMessage("");
          void auth.getIdentityToken().then((token) => requestHostWithdrawal(token, Math.round(Number(withdrawalAmount) * 100)))
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
          <Chip title={withdrawal.status} />
        </Row>)}
      </Card>}
    </Shell>
  );
}
