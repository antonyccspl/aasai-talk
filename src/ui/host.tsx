import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
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
import { submitPhoneHostApplication } from "@/data/host-applications";
import { useAuth } from "@/data/auth";
import { colors as c } from "./theme";
import { fetchHostCurrentSlabs, fetchHostDailyCallSummary, fetchHostDailyCallTime, type HostCurrentSlab, type HostDailyCallSummary } from "@/data/host-metrics";

function DocumentUpload({
  label,
  fileName,
  onChange,
}: {
  label: string;
  fileName: string;
  onChange: (name: string) => void;
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
      if (!result.canceled && result.assets[0]) onChange(result.assets[0].name);
    } catch {
      setError("Could not open the document picker. Please try again.");
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
            fileName={form.aadhaarDocument}
            onChange={(aadhaarDocument) => update({ aadhaarDocument })}
          />
          <DocumentUpload
            label="PAN card"
            fileName={form.panDocument}
            onChange={(panDocument) => update({ panDocument })}
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
            Your applicable diamond rate is calculated from your consolidated
            call time each day.
          </T>
          <Button
            title="Submit"
            onPress={() => {
              if (!auth.demoPhone) {
                setError("Your phone session is missing. Please sign in again.");
                return;
              }
              void submitPhoneHostApplication(auth.demoPhone, form)
                .then(() => {
                  d.setHostStatus("pending");
                  router.replace("/host/status");
                })
                .catch((submitError) => {
                  console.error("Failed to submit host application:", submitError);
                  setError(
                    "We could not submit your Host application. Please try again.",
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
  const [currentSlabs, setCurrentSlabs] = useState<HostCurrentSlab[]>([]);
  const [dailySummary, setDailySummary] = useState<HostDailyCallSummary[]>([]);
  const [dailyCallTimeError, setDailyCallTimeError] = useState("");
  const loadDailyCallTime = async () => {
    if (!auth.demoPhone) return;
    try {
      const result = await fetchHostDailyCallTime(auth.demoPhone);
      setDailyCallTime(result);
      setDailySummary(await fetchHostDailyCallSummary(auth.demoPhone));
      setCurrentSlabs(await fetchHostCurrentSlabs(auth.demoPhone));
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
          {currentSlabs.length > 0 ? (
            <View style={{ gap: 4, marginTop: 12 }}>
              <T bold>Current receiver slab</T>
              {currentSlabs.map((slab) => (
                <T key={slab.call_type} color={c.secondary}>
                  {slab.call_type === "VIDEO" ? "Video" : "Audio"}: {slab.diamonds_per_minute} diamonds/min
                </T>
              ))}
            </View>
          ) : null}
          {dailyCallTimeError ? <Notice error>{dailyCallTimeError}</Notice> : null}
          <T bold style={{ marginTop: 14 }}>Daily history</T>
          {dailySummary.filter((item) => item.seconds || item.calls).map((item) => (
            <Row key={item.date} style={{ justifyContent: "space-between" }}>
              <T>{item.date}</T>
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
  const [method, setMethod] = useState<"upi" | "bank">("upi");
  const [amount, setAmount] = useState("");
  const [upi, setUpi] = useState("");
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const previewMode = preview && d.hostStatus === "pending";
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
  const requestWithdrawal = () => {
    const requested = Number(amount);
    const validUpi = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/.test(upi);
    const validBank =
      /^\d{9,18}$/.test(account) &&
      /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());
    if (!Number.isInteger(requested) || requested < 100)
      return setError("Minimum withdrawal is ₹100.");
    if (requested > d.hostEarnings)
      return setError("Enter an amount within your available Host earnings.");
    if ((method === "upi" && !validUpi) || (method === "bank" && !validBank))
      return setError(
        method === "upi"
          ? "Enter a valid UPI ID."
          : "Enter a valid account number and IFSC.",
      );
    d.setHostEarnings((value) => value - requested);
    d.setWithdrawals((items) => [
      {
        id: `${Date.now()}`,
        amount: requested,
        method: method === "upi" ? "UPI" : "Bank account",
        status: "Pending",
        date: new Date().toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
      },
      ...items,
    ]);
    setError("");
    setMessage("Withdrawal request created. Its status is Pending.");
    setAmount("");
  };
  const history = d.withdrawals;
  return (
    <Shell title="Host earnings">
      {previewMode && (
        <Notice>
          ₹{d.hostEarnings} in earnings and the history below are shown while your
          application remains pending review.
        </Notice>
      )}
      <Card>
        <T size={12} color={c.secondary}>
          AVAILABLE HOST EARNINGS
        </T>
        <T size={30} bold>
          ₹{d.hostEarnings}
        </T>
        <T size={12} color={c.secondary}>
          Minimum withdrawal: ₹100
        </T>
      </Card>
      <T size={18} bold>
        Withdraw earnings
      </T>
      <Row>
        <Button
          title="UPI ID"
          style={{ flex: 1 }}
          variant={method === "upi" ? "primary" : "secondary"}
          onPress={() => setMethod("upi")}
        />
        <Button
          title="Bank account"
          style={{ flex: 1 }}
          variant={method === "bank" ? "primary" : "secondary"}
          onPress={() => setMethod("bank")}
        />
      </Row>
      <Field
        label="Withdrawal amount"
        numeric
        value={amount}
        onChange={(value) => {
          setAmount(value);
          setError("");
        }}
        placeholder="Minimum ₹100"
        error={error}
      />
      {method === "upi" ? (
        <Field
          label="UPI ID"
          value={upi}
          onChange={(value) => {
            setUpi(value);
            setError("");
          }}
          placeholder="name@bank"
        />
      ) : (
        <>
          <Field
            label="Account number"
            numeric
            value={account}
            onChange={(value) => {
              setAccount(value);
              setError("");
            }}
            placeholder="Enter account number"
          />
          <Field
            label="IFSC code"
            value={ifsc}
            onChange={(value) => {
              setIfsc(value.toUpperCase());
              setError("");
            }}
            placeholder="ABCD0123456"
          />
        </>
      )}
      {message ? <Notice>{message}</Notice> : null}
      <Button
        title="Request withdrawal"
        onPress={requestWithdrawal}
        disabled={d.hostEarnings < 100}
      />
      {history.length ? (
        <Card>
          <T bold>Withdrawal history</T>
          {history.map((item) => (
            <Row key={item.id} style={{ justifyContent: "space-between" }}>
              <View>
                <T bold>₹{item.amount}</T>
                <T size={12} color={c.secondary}>
                  {item.method} · {item.date}
                </T>
              </View>
              <T color={c.warning} bold>
                {item.status}
              </T>
            </Row>
          ))}
        </Card>
      ) : null}
    </Shell>
  );
}
