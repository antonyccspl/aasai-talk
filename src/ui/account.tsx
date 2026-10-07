import { useAuth } from "@/data/auth";
import { fetchPhoneCallNotifications, markPhoneCallNotificationRead, type PhoneCallNotification } from "@/data/call-sessions";
import { fetchPhoneMessageNotifications, subscribeToAllPhoneMessages, type PhoneMessageNotification } from "@/data/chat";
import {
    requestPhoneAccountDeletion,
    setPhoneBlock,
    type PhoneDeletionReason,
} from "@/data/phone-safety";
  import { registerPushDevice, showPushTestNotification, updatePushPreferences } from "@/data/push-notifications";
import { saveDemoProfile, saveOwnProfile } from "@/data/profile";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { AuthButton, authColors, AuthField, AuthFrame, AuthText } from "./auth-design";
import {
    Avatar,
    Badge,
    Button,
    Card,
    Chip,
    Chips,
    Empty,
    Field,
    go,
    Icon,
    LoadingCards,
    Notice,
    Row,
    Section,
    Setting,
    Shell,
    T
} from "./components";
import { PhotoPicker } from "./photo-picker";
import { people, personFor, useDemo } from "./store";
import { colors as c } from "./theme";
import { Welcome } from "./welcome";
import { priorityIndianLanguages, useLanguage } from "./language";

function latestEligibleBirthday() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date;
}

function isEligibleBirthday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const birthday = new Date(year, month - 1, day);
  if (birthday.getFullYear() !== year || birthday.getMonth() !== month - 1 || birthday.getDate() !== day)
    return false;
  return birthday <= latestEligibleBirthday();
}

function otpErrorMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toLowerCase()
      : "";
  const providerError = `${code} ${detail}`.toLowerCase();
  if (/unauthorized-domain|app-not-authorized|auth\/invalid-tenant-id|firebase web app settings/i.test(providerError)) {
    return "Phone sign-in is not available on this website yet. Please try again later.";
  }
  if (/captcha|invalid-app-credential|missing-app-credential/i.test(providerError)) {
    return "We could not verify this request. Refresh the page and try again.";
  }
  if (/operation-not-allowed|provider.*disabled|phone.*disabled/i.test(providerError)) {
    return "Phone sign-in is not available right now. Please try again later.";
  }
  if (/too-many-requests|quota-exceeded|throttl/i.test(providerError)) {
    return "Too many attempts were made. Please wait a little, then try again.";
  }
  if (/invalid-phone-number/i.test(providerError)) {
    return "Enter a valid mobile number with the +91 country code.";
  }
  if (/network-request-failed|network error/i.test(providerError)) {
    return "We could not send the code. Check your connection and try again.";
  }
  return "We could not send a verification code. Please try again.";
}

function OnboardingProgress({ step, label }: { step: number; label: string }) {
  return (
    <View style={{ gap: 8, paddingTop: 8 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <T mono size={11} color={c.mint} bold>
          STEP {step} OF 6
        </T>
        <T mono size={11} color={c.secondary}>
          {label}
        </T>
      </Row>
      <View style={{ height: 7, borderRadius: 99, backgroundColor: c.high }}>
        <View
          style={{
            width: `${(step / 6) * 100}%`,
            height: 7,
            borderRadius: 99,
            backgroundColor: c.mint,
          }}
        />
      </View>
    </View>
  );
}

export function Auth({ mode }: { mode: string }) {
  const d = useDemo();
  const auth = useAuth();
  const params = useLocalSearchParams<{ phone?: string }>();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(60);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mode !== "otp" || resendSeconds <= 0) return;
    const timer = setTimeout(
      () => setResendSeconds((value) => value - 1),
      1000,
    );
    return () => clearTimeout(timer);
  }, [mode, resendSeconds]);
  const [gender, setGender] = useState(d.profile.gender);
  const [dob, setDob] = useState(d.profile.dob);
  const [showDate, setShowDate] = useState(false);
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);
  const otpInput = useRef<TextInput>(null);
  const otpPhone = params.phone || phone;
  if (mode === "splash") return <Welcome />;
  if (mode === "create-profile") return <ProfileEdit onboarding />;
  if (mode === "permissions") return <Permissions onboarding />;
  if (mode === "guidelines")
    return (
      <Shell title="Community promise" immersive>
        <OnboardingProgress step={6} label="Almost there" />
        <T size={27} bold>Help keep Aasai Talk kind.</T>
        <T color={c.secondary}>Be genuine, respect boundaries, and never ask for money or share someone’s private information.</T>
        <Card style={{ gap: 10 }}>
          <Row><Icon name="shield" color={c.mint} /><T bold>Our community standards</T></Row>
          <T size={13} color={c.secondary}>Harassment, scams, impersonation, and sexual exploitation are not allowed. You can block or report anyone at any time.</T>
          <Button title="Read community guidelines" variant="secondary" onPress={() => go("/settings/policies/community")} />
        </Card>
        <Chip title="I agree to follow the community guidelines" selected={guidelinesAccepted} onPress={() => setGuidelinesAccepted((value) => !value)} />
        <Button title="Continue" disabled={!guidelinesAccepted} onPress={() => go("/auth/complete")} />
      </Shell>
    );
  if (mode === "photo")
    return (
      <Shell title="Add a photo" immersive>
        <OnboardingProgress step={3} label="Profile setup" />
        <View style={{ paddingVertical: 24, alignItems: "center", gap: 16 }}>
          <T size={24} bold>
            Help people recognize you.
          </T>
          <T color={c.secondary} style={{ textAlign: "center" }}>
            Choose a clear photo. You can change it later in your profile.
          </T>
        </View>
        <PhotoPicker uri={d.photo} onChange={d.setPhoto} />
        <Button title="Continue" disabled={!d.photo} onPress={() => go("/auth/gender")} />
        <Button
          title="Back to profile"
          variant="secondary"
          onPress={() => go("/auth/create-profile")}
        />
      </Shell>
    );
  if (mode === "gender")
    return (
      <Shell title="Tell us about you" immersive>
        <OnboardingProgress step={4} label="66% complete" />
        <T size={30} bold>
          Select your gender
        </T>
        <T color={c.secondary}>
          This helps tailor your profile. It never creates a special role.
        </T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {[
            ["Female", "User profile"],
            ["Male", "User profile"],
          ].map(([title, detail]) => {
            const selected = gender === title;
            return (
              <Pressable
                key={title}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setGender(title)}
                style={{
                  width: "47%",
                  minHeight: 144,
                  borderRadius: 22,
                  padding: 16,
                  justifyContent: "space-between",
                  backgroundColor: selected ? c.high : c.low,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? c.mint : c.line,
                }}
              >
                <Icon
                  name={
                    title === "Female"
                      ? "user"
                      : title === "Male"
                        ? "users"
                        : "shield"
                  }
                  color={selected ? c.mint : c.secondary}
                  size={28}
                />
                <View>
                  <T bold size={17}>
                    {title}
                  </T>
                  <T size={12} color={c.secondary}>
                    {detail}
                  </T>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Notice>
          Your gender is kept private and never changes your account type
          automatically.
        </Notice>
        <Button
          title="Continue"
          onPress={() => {
            d.setProfile({ ...d.profile, gender });
            go("/auth/birthday");
          }}
        />
      </Shell>
    );
  if (mode === "birthday")
    return (
      <Shell title="When's your birthday?" immersive>
        <OnboardingProgress step={5} label="85% complete" />
        <T size={24} bold>
          Confirm your age
        </T>
        <T color={c.secondary}>
          You must be at least 18 years old to use Aasai Talk.
        </T>
        <Card>
          <T bold>Enter your date of birth</T>
          {Platform.OS !== "web" && (
            <Button
              title={dob || "Choose birthday"}
              variant="secondary"
              onPress={() => setShowDate(true)}
            />
          )}
          {showDate && Platform.OS !== "web" && (
            <DateTimePicker
              mode="date"
              value={
                Number.isNaN(Date.parse(dob))
                  ? new Date(2000, 0, 1)
                  : new Date(`${dob}T12:00:00`)
              }
              maximumDate={latestEligibleBirthday()}
              onChange={(event, date) => {
                setShowDate(
                  Platform.OS === "ios" && event.type !== "dismissed",
                );
                if (event.type === "set" && date)
                  setDob(
                    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
                  );
              }}
            />
          )}
        </Card>
        {error && <Notice error>{error}</Notice>}
        <Notice>
          Your birthday is never shown publicly. It is only used to keep the
          community age-appropriate.
        </Notice>
        <Button
          title="Continue"
          onPress={() => {
            const date = new Date(`${dob}T00:00:00`);
            const today = new Date();
            const age =
              today.getFullYear() -
              date.getFullYear() -
              (today.getMonth() < date.getMonth() ||
              (today.getMonth() === date.getMonth() &&
                today.getDate() < date.getDate())
                ? 1
                : 0);
            const valid =
              !Number.isNaN(date.getTime()) &&
              `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` ===
                dob;
            if (!valid || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || age < 18)
              return setError(
                "You need to meet the minimum age requirement to use Aasai Talk.",
              );
            d.setProfile({ ...d.profile, dob });
            go("/auth/guidelines");
          }}
        />
      </Shell>
    );
  if (mode === "complete")
    return (
      <Shell immersive>
        <View style={{ paddingVertical: 78, alignItems: "center", gap: 16 }}>
          <Icon name="check-circle" size={64} color={c.mint} />
          <T size={28} bold>
            You're all set!
          </T>
          <T color={c.secondary} style={{ textAlign: "center" }}>
            Welcome to Aasai Talk. Your profile is ready to use.
          </T>
        </View>
        <Button
          title={busy ? "Finishing setup…" : "Continue to Aasai Talk"}
          disabled={busy}
          onPress={() => {
            setBusy(true);
            void (auth.demoPhone
              ? auth.getIdentityToken().then((token) => saveDemoProfile(auth.demoPhone!, { ...d.profile, guidelinesAccepted: true }, token))
              : auth.user
                ? saveOwnProfile(d.profile)
                : Promise.reject(new Error("Phone session is missing.")))
              .then((approvedPhoto) => {
                if (approvedPhoto) d.setPhoto(approvedPhoto);
                router.replace("/explore");
              })
              .catch((saveError) => {
                console.error(
                  "Failed to save authenticated profile:",
                  saveError,
                );
                if (auth.demoPhone && d.photo && !/^https:\/\//i.test(d.photo))
                  d.setPhoto("");
                setError(
                  saveError instanceof Error
                    ? saveError.message
                    : "We could not save your profile. Please try again.",
                );
              })
              .finally(() => setBusy(false));
          }}
        />
      </Shell>
    );
  return (
    <AuthFrame otp={mode === "otp"} phone={otpPhone}>
      {mode === "otp" ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enter verification code"
            onPress={() => otpInput.current?.focus()}
            style={{
              flexDirection: "row",
              gap: 8,
              justifyContent: "space-between",
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 54,
                  borderRadius: 14,
                  backgroundColor: authColors.background,
                  borderWidth: 1.5,
                  borderColor: index === code.length ? authColors.brand : authColors.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AuthText size={20} bold>
                  {code[index] || "·"}
                </AuthText>
              </View>
            ))}
          </Pressable>
          <TextInput
            ref={otpInput}
            accessibilityLabel="Verification code"
            value={code}
            onChangeText={(value) => {
              setCode(value.replace(/\D/g, "").slice(0, 6));
              setError("");
            }}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
          />
          {error && (
            <AuthText size={12} color={authColors.brand}>
              {error}
            </AuthText>
          )}
          <AuthButton
            title={busy ? "Verifying…" : "Verify OTP"}
            disabled={busy}
            loading={busy}
            onPress={() => {
              if (code.length !== 6 || !otpPhone) {
                setError("Enter the six-digit verification code.");
                return;
              }
              setBusy(true);
              void auth
                .verifyOtp(otpPhone, code)
                .then((profileComplete) =>
                  router.replace(
                    profileComplete ? "/explore" : "/auth/create-profile",
                  ),
                )
                .catch((verificationError) => {
                  console.error(
                    "Supabase OTP verification failed:",
                    verificationError,
                  );
                  setError(
                    "That code is invalid or expired. Request a new code and try again.",
                  );
                })
                .finally(() => setBusy(false));
            }}
          />
          <AuthButton
            title={
              resendSeconds > 0
                ? `Resend in 00:${String(resendSeconds).padStart(2, "0")}`
                : sent
                  ? "Resend code"
                  : "Resend code"
            }
            variant="secondary"
            disabled={resendSeconds > 0 || busy}
            loading={busy}
            onPress={() => {
              setSent(true);
              setResendSeconds(60);
              setCode("");
              setError("");
              if (!otpPhone) return;
              setBusy(true);
              void auth
                .sendOtp(otpPhone)
                .catch((sendError) => {
                  setError(otpErrorMessage(sendError));
                  setResendSeconds(0);
                })
                .finally(() => setBusy(false));
            }}
          />
          <AuthButton
            title="Change phone number"
            variant="secondary"
            onPress={() => go("/auth/login")}
          />
        </>
      ) : (
        <>
          <AuthField
            label="Mobile number (+91)"
            value={phone}
            onChange={(value) => {
              setPhone(value.replace(/\D/g, "").slice(0, 10));
              setError("");
            }}
            numeric
            placeholder="98765 43210"
            error={error}
          />
          {Platform.OS === "web" && (
            <View
              nativeID="aasai-firebase-recaptcha"
              style={{ minHeight: 78, alignItems: "center" }}
            />
          )}
          <AuthButton
            title={busy ? "Sending code…" : "Continue with phone"}
            disabled={busy}
            loading={busy}
            icon="arrow-right"
            onPress={() => {
              if (!/^\d{10}$/.test(phone)) {
                setError("Enter a valid 10-digit mobile number.");
                return;
              }
              const formattedPhone = `+91${phone}`;
              setBusy(true);
              void auth
                .sendOtp(formattedPhone)
                .then(() => {
                  setResendSeconds(60);
                  router.push({
                    pathname: "/[...route]",
                    params: { route: ["auth", "otp"], phone: formattedPhone },
                  });
                })
                .catch((sendError) => {
                  setError(otpErrorMessage(sendError));
                })
                .finally(() => setBusy(false));
            }}
          />
          <AuthText size={12} color={authColors.muted}>
            A secure verification code will be sent to your number.
          </AuthText>
        </>
      )}
    </AuthFrame>
  );
}
export function ProfileEdit({ onboarding }: { onboarding?: boolean }) {
  const d = useDemo();
  const auth = useAuth();
  const [form, setForm] = useState(() =>
    onboarding ? { ...d.profile, name: "", username: "" } : d.profile,
  );
  // This is deliberately screen-local. A photo must not survive leaving this
  // editor until the save request has completed and the server has approved it.
  const [photo, setPhoto] = useState(() =>
    onboarding ? d.photo : d.profile.photo || "",
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const change = (key: keyof typeof form, value: string | string[]) => {
    setForm((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };
  return (
    <Shell title={onboarding ? "Create your profile" : "Edit profile"}>
      <Row>
        <Avatar size={68} name={form.name} />
        <View style={{ flex: 1 }}>
          <T size={20} bold>
            Your kind of connection
          </T>
          <Button
            title="Change photo"
            variant="secondary"
            onPress={() => setAvatar(!avatar)}
          />
        </View>
      </Row>
      {avatar && <PhotoPicker uri={photo} onChange={setPhoto} />}
      {(["name", "username", "city"] as const).map((key) => (
        <Field
          key={key}
          label={key[0].toUpperCase() + key.slice(1)}
          value={form[key]}
          onChange={(v) => change(key, v)}
        />
      ))}
      <Card>
        <T size={13} color={c.secondary}>
          Date of birth
        </T>
        {Platform.OS === "web" ? (
          <Field
            label="Date of birth (YYYY-MM-DD)"
            value={form.dob}
            onChange={(value) => change("dob", value)}
            placeholder="YYYY-MM-DD"
          />
        ) : (
          <Button
            title={form.dob || "Choose date of birth"}
            variant="secondary"
            onPress={() => setShowDate(true)}
          />
        )}
        {showDate && Platform.OS !== "web" && (
          <DateTimePicker
            mode="date"
            value={new Date(`${form.dob || "2000-01-01"}T12:00:00`)}
            maximumDate={latestEligibleBirthday()}
            onChange={(event, date) => {
              setShowDate(Platform.OS === "ios" && event.type !== "dismissed");
              if (event.type === "set" && date)
                change(
                  "dob",
                  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
                );
            }}
          />
        )}
      </Card>
      <Field
        label="Bio"
        value={form.bio}
        onChange={(v) => change("bio", v)}
        multiline
      />
      <Section title="Gender" />
      <Chips
        items={["Female", "Male"]}
        selected={form.gender}
        onChange={(v) => change("gender", v)}
      />
      <Section title="Languages" />
      <Row style={{ flexWrap: "wrap" }}>
        {["Hindi", "English", "Kannada", "Tamil"].map((x) => (
          <Chip
            key={x}
            title={x}
            selected={form.languages.includes(x)}
            onPress={() =>
              change(
                "languages",
                form.languages.includes(x)
                  ? form.languages.filter((y) => y !== x)
                  : [...form.languages, x],
              )
            }
          />
        ))}
      </Row>
      <Section title="Interests" />
      <Row style={{ flexWrap: "wrap" }}>
        {["Music", "Travel", "Poetry", "Books", "Coffee", "Movies"].map((x) => (
          <Chip
            key={x}
            title={x}
            selected={form.interests.includes(x)}
            onPress={() =>
              change(
                "interests",
                form.interests.includes(x)
                  ? form.interests.filter((y) => y !== x)
                  : [...form.interests, x],
              )
            }
          />
        ))}
      </Row>
      {error.includes("nudity policy") ? (
        <View
          accessibilityLiveRegion="assertive"
          style={{
            gap: 10,
            padding: 18,
            borderRadius: 20,
            backgroundColor: "#fff1f2",
            borderWidth: 1,
            borderColor: "#fda4af",
            borderLeftWidth: 6,
            borderLeftColor: c.error,
          }}
        >
          <Row style={{ alignItems: "center", gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#ffe4e6" }}>
              <Icon name="shield" size={20} color={c.error} />
            </View>
            <T bold size={17} color={c.error}>Photo not allowed</T>
          </Row>
          <T size={14} color="#9f1239">
            Explicit sexual or nude images are not allowed on Aasai Talk. Choose another clear, non-explicit photo.
          </T>
          <T size={12} color="#9f1239">
            This image was not saved and is not visible to other people.
          </T>
        </View>
      ) : error ? <Notice error>{error}</Notice> : null}
      {saved && <Notice>Profile saved.</Notice>}
      <Button
        title={busy ? "Saving…" : onboarding ? "Continue" : "Save changes"}
        disabled={busy}
        onPress={() => {
          const name = form.name.trim();
          const city = form.city.trim();
          if (name.length < 2 || name.length > 50 || /[\r\n]/.test(name))
            return setError("Enter a name between 2 and 50 characters.");
          if (!/^[a-zA-Z0-9_]{3,20}$/.test(form.username))
            return setError("Use a 3–20 character username with letters, numbers, or underscores.");
          if (city.length < 2 || city.length > 80 || /[\r\n]/.test(city))
            return setError("Enter a valid city.");
          if (onboarding && !photo)
            return setError("Add a clear profile photo before continuing.");
          if (
            !isEligibleBirthday(form.dob) ||
            !["Female", "Male"].includes(form.gender) ||
            !form.languages.length ||
            form.languages.length > 4 ||
            !form.interests.length ||
            form.interests.length > 6 ||
            form.bio.trim().length > 500 ||
            (onboarding && form.bio.trim().length < 12)
          )
            return setError(
              onboarding
                ? "Add a short bio, then choose an eligible date of birth, gender, language, and interest."
                : "Choose an eligible date of birth, gender, language, and interest. Keep your bio under 500 characters.",
            );
          if (onboarding) {
            d.setProfile({ ...form, name, city, bio: form.bio.trim() });
            setError("");
            go("/auth/permissions");
            return;
          }
          setBusy(true);
          void (
            auth.user
              ? saveOwnProfile({ ...form, name, city, bio: form.bio.trim() })
              : auth.demoPhone
                  ? auth.getIdentityToken().then((token) => saveDemoProfile(auth.demoPhone!, { ...form, name, city, bio: form.bio.trim(), photo }, token))
                : Promise.reject(new Error("Demo phone is missing."))
          )
            .then((approvedPhoto) => {
              const savedPhoto = approvedPhoto || d.profile.photo || "";
              d.setPhoto(savedPhoto);
              setPhoto(savedPhoto);
              d.setProfile({ ...form, name, city, bio: form.bio.trim(), photo: savedPhoto });
              setError("");
              setSaved(true);
            })
            .catch((saveError) => {
              console.error("Failed to save profile:", saveError);
              // A failed moderation or save must never leave the local file
              // URI in the editor or global profile state.
              const savedPhoto = d.profile.photo || "";
              setPhoto(savedPhoto);
              d.setPhoto(savedPhoto);
              setError(
                saveError instanceof Error
                  ? saveError.message
                  : "We could not save your profile. Check your details and try again.",
              );
            })
            .finally(() => setBusy(false));
        }}
      />
    </Shell>
  );
}
export function Profile() {
  const d = useDemo();
  const approvedHost = d.hostStatus === "approved";
  const inCall = d.active?.status === "Connected" || d.active?.status === "Ringing";
  return (
    <Shell title="My profile">
      <View style={{ alignItems: "center", gap: 10, padding: 14 }}>
        <Avatar size={84} />
        <T size={24} bold>
          {d.profile.name}
        </T>
        <T color={c.muted}>@{d.profile.username}</T>
        <Badge
          text={
            approvedHost
              ? inCall ? "Busy on another call" : "Online"
              : d.active
                ? "Busy · in a call"
                : d.available
                  ? "Available for a conversation"
                  : "Unavailable"
          }
          warning={approvedHost ? inCall : !!d.active || !d.available}
        />
      </View>
      <Card>
        <T>{d.profile.bio}</T>
        <Row style={{ flexWrap: "wrap" }}>
          {[...d.profile.languages, ...d.profile.interests].map((x) => (
            <Chip key={x} title={x} />
          ))}
        </Row>
        <Button
          title="Edit profile"
          icon="edit-2"
          variant="secondary"
          onPress={() => go("/profile/edit")}
        />
      </Card>
      {approvedHost && (
        <Setting
          title="Presence status"
          detail="Automatic from app activity and calls"
          icon="radio"
          onPress={() => go("/profile/availability")}
        />
      )}
      <Setting
        title="Favorites"
        icon="heart"
        onPress={() => go("/favorites")}
      />
      <Setting title="Call history" icon="phone" onPress={() => go("/calls")} />
      {d.paid && d.hostStatus !== "approved" && (
        <Setting
          title="Wallet"
          icon="credit-card"
          onPress={() => go("/wallet")}
        />
      )}
      <Setting
        title="Notifications"
        icon="bell"
        onPress={() => go("/notifications")}
      />
      <Setting
        title="Settings"
        icon="settings"
        onPress={() => go("/settings")}
      />
    </Shell>
  );
}
export function Permissions({ onboarding }: { onboarding?: boolean }) {
  const [state, setState] = useState<Record<string, string>>({});
  return (
    <Shell
      title={onboarding ? "Make room for conversations" : "App permissions"}
    >
      <T color={c.secondary}>
        You stay in control. Permission is requested when you use a feature.
      </T>
      {(
        ["Microphone", "Camera", "Notifications", "Photos and media"] as const
      ).map((name, i) => (
        <Card key={name}>
          <Row>
            <Icon
              name={(["mic", "video", "bell", "image"] as const)[i]}
              color={c.mint}
            />
            <T size={20} bold>
              {name}
            </T>
          </Row>
          <T color={c.secondary}>
            {
              [
                "Let the other person hear you on a call.",
                "See each other during a video conversation.",
                "Know when someone calls or sends a message.",
                "Share a photo or update your profile.",
              ][i]
            }
          </T>
          <Badge
            text={state[name] || "Not requested"}
            warning={state[name] === "Denied"}
          />
          <Chips
            items={["Allowed", "Denied", "Settings required"]}
            selected={state[name]}
            onChange={(v) => setState((x) => ({ ...x, [name]: v }))}
          />
        </Card>
      ))}
      <Notice>Review the permissions used by Aasai Talk.</Notice>
      {onboarding && (
        <Button
          title="Continue"
          onPress={() => go("/auth/guidelines")}
        />
      )}
    </Shell>
  );
}
export function Settings({
  mode = "settings",
  policy,
}: {
  mode?: string;
  policy?: string;
}) {
  const d = useDemo();
  const auth = useAuth();
  const { language, languageLabel, setLanguage } = useLanguage();
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [question, setQuestion] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [otherDeleteReason, setOtherDeleteReason] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState("");
  const [pushTest, setPushTest] = useState<"call" | "message" | "missed" | "safety">("call");
  useEffect(() => {
    if (mode === "policies") void d.refreshPlatformData();
  }, [d.refreshPlatformData, mode]);
  const refreshAccountData = async () => {
    setRefreshing(true);
    try {
      await d.refreshUserData();
    } catch (error) {
      console.error("Failed to refresh account data:", error);
      setMessage("Unable to refresh your account data. Please try again.");
    } finally {
      setRefreshing(false);
    }
  };
  if (mode === "permissions") return <Permissions />;
  if (mode === "language")
    return (
      <Shell title="App language">
        <T size={24} bold>Choose your app language</T>
        <T color={c.secondary}>
          Choose how Aasai Talk appears on this device. English is the default.
        </T>
        {priorityIndianLanguages.filter((item) => item.code === "en").map((item) => {
          const selected = language === item.code;
          return <Pressable
            key={item.code}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => void setLanguage(item.code)}
            style={({ pressed }) => ({
              minHeight: 84, padding: 18, borderRadius: 22, borderWidth: 1.5,
              borderColor: selected ? c.mint : c.line, backgroundColor: selected ? c.high : c.surface,
              opacity: pressed ? 0.72 : 1, flexDirection: "row", alignItems: "center", gap: 14,
            })}
          >
            <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: selected ? c.mint : c.low }}>
              <Icon name="globe" color={selected ? c.ink : c.mint} size={21} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T bold size={17}>{item.nativeLabel}</T>
              <T size={12} color={c.secondary}>Default app language</T>
            </View>
            {selected ? <Icon name="check-circle" color={c.success} size={24} /> : null}
          </Pressable>;
        })}
        <Section title="Indian languages" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {priorityIndianLanguages.filter((item) => item.code !== "en" && item.available).map((item) => {
            const selected = language === item.code;
            return <Pressable
              key={item.code}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => void setLanguage(item.code)}
              style={({ pressed }) => ({
                width: "48.4%", minHeight: 104, padding: 14, borderRadius: 20, borderWidth: 1.5,
                borderColor: selected ? c.mint : c.line, backgroundColor: selected ? c.high : c.low,
                opacity: pressed ? 0.72 : 1, justifyContent: "space-between",
              })}
            >
              <View style={{ alignSelf: "flex-end", width: 23, height: 23, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: selected ? c.success : c.surface, borderWidth: selected ? 0 : 1, borderColor: c.line }}>
                {selected ? <Icon name="check" color="#fff" size={15} /> : null}
              </View>
              <View style={{ gap: 2 }}>
                <T bold size={17} numberOfLines={1}>{item.nativeLabel}</T>
                <T size={12} color={c.secondary}>{item.label}</T>
              </View>
            </Pressable>;
          })}
        </View>
      </Shell>
    );
  if (
    mode === "availability" &&
    d.profile.gender === "Female" &&
    d.hostStatus === "approved"
  )
    return (
      <Shell title="Presence status">
        <Card>
          <T size={22} bold>Presence is automatic</T>
          <Badge
            text={d.active?.status === "Connected" || d.active?.status === "Ringing" ? "On a call" : "Available"}
            warning={d.active?.status === "Connected" || d.active?.status === "Ringing"}
          />
          <T color={c.secondary}>
            You appear Available while Aasai Talk is open, On a call while a call is ringing or connected, and Away after the app has not checked in for a short time.
          </T>
        </Card>
      </Shell>
    );
  if (mode === "privacy" || mode === "notifications") {
    const names =
      mode === "privacy"
        ? [
            "Show online status",
            "Show last seen",
            "Allow messages",
            "Allow calls",
          ]
        : ["Message alerts", "Call alerts", "Payment updates", "Announcements"];
    return (
      <Shell
        title={
          mode === "privacy" ? "Privacy and safety" : "Notification preferences"
        }
      >
        <T color={c.secondary}>{mode === "privacy" ? "Choose what you want to share." : "Choose how Aasai Talk keeps you updated."}</T>
        <Card style={{ gap: 2 }}>
          <T bold size={15}>{mode === "privacy" ? "Your privacy" : "Alerts"}</T>
          <T size={12} color={c.muted}>{mode === "privacy" ? "You can change these at any time." : "Turn off anything you do not want to receive."}</T>
          {names.map((x) => (
            <Setting
              key={x}
              title={x}
              value={d.prefs[x]}
              onToggle={(v) => {
                const next = { ...d.prefs, [x]: v };
                d.setPrefs(next);
                if (auth.demoPhone && mode === "notifications") {
                  void auth.getIdentityToken().then((idToken) =>
                    updatePushPreferences(idToken, {
                      calls: next["Call alerts"] !== false,
                      messages: next["Message alerts"] !== false,
                      wallet: next["Payment updates"] !== false,
                    }),
                  ).catch((error) => console.warn("Unable to sync push preferences:", error));
                }
              }}
              icon={mode === "privacy" ? "shield" : "bell"}
            />
          ))}
        </Card>
        {mode === "notifications" && Platform.OS !== "web" && (
          <>
            <Button
              title={pushBusy ? "Enabling…" : "Enable push notifications"}
              icon="bell"
              disabled={pushBusy || !auth.demoPhone}
              onPress={() => {
                setPushBusy(true);
                setPushMessage("");
                void auth.getIdentityToken()
                  .then((idToken) => registerPushDevice(idToken, {
                    calls: d.prefs["Call alerts"] !== false,
                    messages: d.prefs["Message alerts"] !== false,
                    wallet: d.prefs["Payment updates"] !== false,
                  }))
                  .then((token) => setPushMessage(token
                    ? "Push notifications are enabled on this device."
                    : "Notifications are disabled in device settings."))
                  .catch((error) => setPushMessage(error instanceof Error ? error.message : "Unable to enable push notifications."))
                  .finally(() => setPushBusy(false));
              }}
            />
            {pushMessage ? <Notice>{pushMessage}</Notice> : null}
            <Card style={{ gap: 10 }}>
              <T bold size={15}>Check notifications on this device</T>
              <T size={12} color={c.muted}>This sends a test alert only to this device. It does not contact anyone.</T>
              <Chips items={["call", "message", "missed", "safety"]} selected={pushTest} onChange={(value) => setPushTest(value as typeof pushTest)} />
              <Button title="Show test alert" variant="secondary" disabled={pushBusy} onPress={() => {
                setPushBusy(true);
                setPushMessage("");
                void showPushTestNotification(pushTest)
                  .then(() => setPushMessage("Test alert sent. Lock the phone or open the notification tray to check it."))
                  .catch((error) => setPushMessage(error instanceof Error ? error.message : "Unable to show a test alert."))
                  .finally(() => setPushBusy(false));
              }} />
            </Card>
          </>
        )}
        <Card style={{ gap: 2 }}>
          <T bold size={15}>{mode === "privacy" ? "Safety tools" : "Device settings"}</T>
          <T size={12} color={c.muted}>{mode === "privacy" ? "Review the people you have blocked." : "Manage permissions for this device."}</T>
          <Setting
            title={mode === "privacy" ? "Blocked users" : "System permissions"}
            icon="settings"
            onPress={() =>
              go(
                mode === "privacy"
                  ? "/settings/blocked-users"
                  : "/settings/permissions",
              )
            }
          />
        </Card>
      </Shell>
    );
  }
  if (mode === "blocked-users")
    return (
      <Shell title="Blocked users">
        {d.blocked.length ? (
          d.blocked.map((id) => (
            <Setting
              key={id}
              title={personFor(id).name}
              detail="Blocked"
              icon="slash"
              onPress={() => go(`/block/${id}`)}
            />
          ))
        ) : (
          <Empty
            icon="shield"
            title="You haven’t blocked anyone"
            message="People you block will appear here. You can unblock them at any time."
          />
        )}
      </Shell>
    );
  if (mode === "policies") {
    const policyKey = (policy || "privacy").toLowerCase();
    const sections = d.policies[policyKey] || d.policies["privacy"];
    const policyTitle = policy === "terms"
      ? "Terms and Conditions"
      : policy === "community"
        ? "Community Guidelines"
        : policy === "safety"
          ? "Safety Center"
          : policy === "refund"
            ? "Refund and Payment Policy"
            : "Privacy Policy";
    return (
      <Shell title={policyTitle}>
        <T size={24} bold>
          {policyTitle}
        </T>
        {sections && sections.length > 0 ? (
          sections.map((s, idx) => (
            <Card key={idx}>
              <T size={18} bold>
                {s.title}
              </T>
              <T color={c.secondary} style={{ marginTop: 6, lineHeight: 22 }}>
                {s.description}
              </T>
            </Card>
          ))
        ) : (
          <Card>
            <T color={c.secondary}>Policy details are loading…</T>
          </Card>
        )}
      </Shell>
    );
  }
  if (mode === "help")
    return (
      <Shell title="We’re here to help">
        <T size={24} bold>
          Let’s figure it out.
        </T>
        {[
          "How do calls work?",
          "Why is my recharge pending?",
          "How do I block someone?",
          "How can I delete my account?",
        ].map((q, i) => (
          <Card key={q}>
            <Setting
              title={q}
              icon="help-circle"
              onPress={() => setQuestion(question === q ? "" : q)}
            />
            {question === q && (
              <T color={c.secondary}>
                {
                  [
                    "Choose an available person, then select Audio or Video on their profile.",
                    "A payment stays pending until it is verified. Check the status before trying another payment.",
                    "Open the person’s profile and select Block. You can also report a concern.",
                    "Open Settings, then Delete account. Review the information before confirming.",
                  ][i]
                }
              </T>
            )}
          </Card>
        ))}
        <Button
          title="Contact support"
          variant="secondary"
          onPress={() =>
            setMessage(
              d.appConfig
                ? `Reach our support desk at ${d.appConfig.support_email} or call ${d.appConfig.support_phone}.`
                : "Support details are temporarily unavailable. Please try again shortly.",
            )
          }
        />
        {message && <Notice>{message}</Notice>}
      </Shell>
    );
  if (mode === "logout" || mode === "delete-account")
    return (
      <Shell title={mode === "logout" ? "Log out" : "Delete account"}>
        <Empty
          icon={mode === "logout" ? "log-out" : "alert-triangle"}
          title={mode === "logout" ? "See you again soon?" : "Before you go"}
          message={
            mode === "logout"
              ? "You can return to your conversations after signing in."
              : "Submit a deletion request for review. Your account remains active until the request is processed."
          }
        />
        {d.active && (
          <Notice error>An ongoing call must be ended first.</Notice>
        )}
        {mode === "delete-account" && (
          <Card>
            <T bold size={17}>
              Why are you leaving?
            </T>
            <T size={12} color={c.secondary}>
              Tell us what happened. This helps improve Aasai Talk.
            </T>
            <Chips
              items={[
                "Asked for money",
                "Not interested",
                "Unable to hear",
                "Buddy not polite",
                "Abusive language",
                "Others",
              ]}
              selected={deleteReason}
              onChange={setDeleteReason}
            />
            {deleteReason === "Others" && (
              <Field
                label="Tell us more"
                value={otherDeleteReason}
                onChange={setOtherDeleteReason}
                placeholder="Share your reason"
                multiline
              />
            )}
            <Notice>
              Your request will be reviewed before account deletion is completed.
            </Notice>
            <Field
              label="Type DELETE to confirm"
              value={confirmation}
              onChange={setConfirmation}
            />
          </Card>
        )}
        {message && <Notice>{message}</Notice>}
        <Button
          title={mode === "logout" ? "Log out" : "Request account deletion"}
          variant="danger"
          disabled={
            !!d.active ||
            deleteSubmitting ||
            (mode === "delete-account" &&
              (confirmation !== "DELETE" ||
                !deleteReason ||
                (deleteReason === "Others" && !otherDeleteReason.trim())))
          }
          onPress={() => {
            if (mode === "logout") {
              void auth
                .signOut()
                .then(() => {
                  d.setActive(null);
                  router.dismissAll();
                  router.replace("/auth/login");
                })
                .catch((signOutError) => {
                  console.error("Supabase sign-out failed:", signOutError);
                  setMessage("We could not log you out. Please try again.");
                });
            } else {
              setDeleteSubmitting(true);
              void auth
                .getIdentityToken()
                .then((idToken) =>
                  requestPhoneAccountDeletion(
                    idToken,
                    deleteReason as PhoneDeletionReason,
                    otherDeleteReason.trim(),
                  ),
                )
                .then((scheduledFor) => {
                  d.setDeletionRequest({
                    reason: deleteReason,
                    details: otherDeleteReason.trim(),
                    requestedAt: new Date().toISOString(),
                  });
                  setMessage(
                    `Your deletion request was recorded on ${new Date(scheduledFor).toLocaleDateString()}. We will review it before completing the deletion.`,
                  );
                })
                .catch((error) => {
                  console.error("Failed to submit account deletion request:", error);
                  setMessage("We could not submit your deletion request. Please try again.");
                })
                .finally(() => setDeleteSubmitting(false));
            }
          }}
        />
        <Button
          title="Keep my account"
          variant="secondary"
          onPress={() => go("/profile")}
        />
      </Shell>
    );
  return (
    <Shell
      title="Settings"
      refreshing={refreshing}
      onRefresh={refreshAccountData}
    >
      {d.profile.gender === "Female" && (
        <>
          {d.hostStatus === "none" && (
            <Setting
              title="Become a Host"
              detail="Talk with people and earn. Apply for admin review."
              onPress={() => go("/host/apply")}
            />
          )}
          {d.hostStatus === "pending" && (
            <Setting
              title="Host application"
              detail="Pending review"
              onPress={() => go("/host/status")}
            />
          )}
          {d.hostStatus === "approved" && (
            <Setting
              title="Host earnings & withdrawals"
              detail="View available earnings and request a withdrawal."
              onPress={() => go("/host/withdraw")}
            />
          )}
        </>
      )}
      <Setting
        title="App language"
        detail={languageLabel}
        icon="globe"
        onPress={() => go("/settings/language")}
      />
      {[
        ["Privacy policy", "settings/policies/privacy"],
        ["Terms and conditions", "settings/policies/terms"],
        ["Safety center", "settings/policies/safety"],
        ["Community guidelines", "settings/policies/community"],
      ].map(([name, path]) => (
        <Setting key={path} title={name} onPress={() => go(`/${path}`)} />
      ))}
      <Button
        title="Log out"
        variant="secondary"
        icon="log-out"
        onPress={() => go("/settings/logout")}
      />
      <Button
        title="Delete account"
        variant="danger"
        icon="trash-2"
        onPress={() => go("/settings/delete-account")}
      />
      <T mono size={11} color={c.muted} style={{ textAlign: "center" }}>
        AASAI TALK · VERSION 1.0
      </T>
    </Shell>
  );
}
export function Safety({ id, mode }: { id: string; mode: string }) {
  const d = useDemo();
  const auth = useAuth();
  const p = personFor(id);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [blockError, setBlockError] = useState("");
  const [blockSubmitting, setBlockSubmitting] = useState(false);
  const [stars, setStars] = useState(0);
  const blocked = d.blocked.includes(id);
  if (mode === "block")
    return (
      <Shell title={blocked ? "Unblock person" : "Block person"}>
        <Empty
          icon="shield"
          title={`${blocked ? "Unblock" : "Block"} ${p.name}?`}
          message={
            blocked
              ? "They will be eligible for discovery, chat, and calls again."
              : "They will be removed from discovery, and you will no longer be able to chat or call each other."
          }
        />
        <Button
          title={blocked ? "Unblock" : "Block person"}
          variant={blocked ? "primary" : "danger"}
          disabled={blockSubmitting}
          onPress={() => {
            const digits = id.startsWith("phone_")
              ? id.slice("phone_".length)
              : "";
            const targetPhone = digits ? `+${digits}` : "";
            setBlockSubmitting(true);
            setBlockError("");
            void (async () => {
              if (targetPhone && auth.demoPhone) {
                await setPhoneBlock(
                  await auth.getIdentityToken(),
                  targetPhone,
                  !blocked,
                );
              }
              d.setBlocked((values) =>
                blocked ? values.filter((value) => value !== id) : [...values, id],
              );
              router.replace(`/user/${id}` as never);
            })()
              .catch((error) => {
                console.error("Unable to update phone block:", error);
                setBlockError(error instanceof Error ? error.message : "Unable to update your block list.");
              })
              .finally(() => setBlockSubmitting(false));
          }}
        />
        {blockError ? <Notice error>{blockError}</Notice> : null}
        <Button
          title="Cancel"
          variant="secondary"
          onPress={() => router.replace("/explore" as never)}
        />
      </Shell>
    );
  if (mode === "rate")
    return (
      <Shell title="Rate your conversation">
        <Avatar person={p} size={72} />
        <T size={24} bold>
          How was your call?
        </T>
        <T color={c.secondary}>A little feedback goes a long way.</T>
        <Row>
          {[1, 2, 3, 4, 5].map((n) => (
            <Chip
              key={n}
              title={`${n} ★`}
              selected={n <= stars}
              onPress={() => setStars(n)}
            />
          ))}
        </Row>
        <Field
          label="Review (optional)"
          value={description}
          onChange={setDescription}
          multiline
        />
        {success && <Notice>Your {stars}-star rating has been added.</Notice>}
        <Button
          title="Submit rating"
          disabled={!stars || success}
          onPress={() => {
            d.setRatings((v) => [
              ...v,
              {
                person: p.id,
                stars,
                review: description.trim(),
                date: new Date().toISOString(),
              },
            ]);
            setSuccess(true);
          }}
        />
      </Shell>
    );
  return (
    <Shell title="Report a concern">
      {success ? (
        <>
          <Empty
            icon="check-circle"
            title="Your concern has been noted"
            message="Your report has been sent to our safety team for review."
          />
          <Button
            title="Block this person too"
            variant="secondary"
            onPress={() => go(`/block/${id}`)}
          />
          <Button title="Back to Explore" onPress={() => go("/explore")} />
        </>
      ) : (
        <>
          <T size={26} bold>
            Help keep conversations kind.
          </T>
          <T color={c.secondary}>What happened with {p.name}?</T>
          <View style={{ gap: 10 }}>
            {[
              "Spam",
              "Harassment",
              "Fake profile",
              "Abusive behavior",
              "Scam",
              "Inappropriate content",
              "Other",
            ].map((x) => (
              <Chip
                key={x}
                title={x}
                selected={reason === x}
                onPress={() => setReason(x)}
              />
            ))}
          </View>
          <Field
            label={
              reason === "Other"
                ? "Tell us more (required)"
                : "Additional details (optional)"
            }
            value={description}
            onChange={setDescription}
            multiline
          />
          {submitError ? <Notice error>{submitError}</Notice> : null}
          <Button
            title={submitting ? "Submitting…" : "Submit report"}
            disabled={submitting || !reason || (reason === "Other" && !description.trim())}
            onPress={() => {
              setSubmitting(true);
              setSubmitError("");
              void d.submitSafetyReport(p.id, p.name, reason, description.trim())
                .then(() => setSuccess(true))
                .catch((error) => {
                  console.error("Unable to submit safety report:", error);
                  setSubmitError("Your report could not be saved. Please check your connection and try again.");
                })
                .finally(() => setSubmitting(false));
            }}
          />
        </>
      )}
    </Shell>
  );
}
export function Notifications() {
  const auth = useAuth();
  const d = useDemo();
  const [messages, setMessages] = useState<PhoneMessageNotification[]>([]);
  const [calls, setCalls] = useState<PhoneCallNotification[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!auth.demoPhone) return;
    let active = true;
    const load = () => Promise.all([
      fetchPhoneMessageNotifications(auth.demoPhone!),
      fetchPhoneCallNotifications(auth.demoPhone!),
    ])
      .then(([messageRows, callRows]) => {
        if (!active) return;
        setMessages(messageRows);
        setCalls(callRows);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load notifications.");
      })
      .finally(() => { if (active) setLoading(false); });
    void load();
    const unsubscribe = subscribeToAllPhoneMessages(auth.demoPhone, () => { void load(); });
    const refreshTimer = setInterval(() => { void load(); }, 10000);
    return () => { active = false; clearInterval(refreshTimer); unsubscribe(); };
  }, [auth.demoPhone]);
  const groupedMessages = Array.from(
    messages.reduce((groups, message) => {
      const existing = groups.get(message.sender_phone);
      if (!existing) {
        groups.set(message.sender_phone, { latest: message, unreadCount: message.read_at ? 0 : 1 });
      } else {
        if (!message.read_at) existing.unreadCount += 1;
        if (new Date(message.created_at).getTime() > new Date(existing.latest.created_at).getTime())
          existing.latest = message;
      }
      return groups;
    }, new Map<string, { latest: PhoneMessageNotification; unreadCount: number }>()).entries(),
  )
    .map(([senderPhone, value]) => ({ senderPhone, ...value }))
    // Notification inbox contains actionable alerts only. Once a chat is
    // opened, its messages are marked read in Supabase and disappear here.
    .filter((item) => item.unreadCount > 0)
    .sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime());
  const formatTime = (value: string) => new Date(value).toLocaleDateString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const groupForDate = (value: string) => {
    const date = new Date(value);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfYesterday = startOfToday - 86_400_000;
    const timestamp = date.getTime();
    if (timestamp >= startOfToday) return "Today";
    if (timestamp >= startOfYesterday) return "Yesterday";
    return "Earlier";
  };
  return (
    <Shell title="Notifications">
      <Card style={{ padding: 14 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T bold size={14}>Your inbox</T>
            <T size={11} color={c.secondary}>Messages, call updates, and safety updates in one place.</T>
          </View>
          <Button title="Preferences" variant="secondary" onPress={() => go("/settings/notifications")} />
        </Row>
      </Card>
      {error ? <Notice error>{error}</Notice> : null}
      {loading ? <LoadingCards count={4} /> : ["Today", "Yesterday", "Earlier"].map((period) => {
        const messageItems = groupedMessages.filter((item) => groupForDate(item.latest.created_at) === period);
        const callItems = calls.filter((call) => groupForDate(call.created_at) === period);
        if (!messageItems.length && !callItems.length) return null;
        return <View key={period} style={{ gap: 2 }}>
          <Section title={period} />
          {messageItems.map((item) => {
            const contact = people.find((person) => person.id === `phone_${item.senderPhone.replace("+", "")}`);
            const name = contact?.name || "New message";
            return <Setting
              key={`message-${item.senderPhone}`}
              title={`${item.unreadCount ? "• " : ""}${name}${item.unreadCount > 1 ? ` · ${item.unreadCount} messages` : ""}`}
              detail={`${item.latest.text} · ${formatTime(item.latest.created_at)}`}
              icon="message-circle"
              onPress={() => go(`/chat/phone_${item.senderPhone.replace("+", "")}`)}
            />;
          })}
          {callItems.map((call) => {
            const contact = people.find((person) => person.id === `phone_${call.other_phone.replace("+", "")}`);
            const name = contact?.name || "Caller";
            const label = call.status === "missed" ? `Missed ${call.call_type} call` : `${call.call_type === "video" ? "Video" : "Audio"} call declined`;
            return <Setting
              key={`call-${call.id}`}
              title={label}
              detail={`${name} · ${formatTime(call.created_at)}`}
              icon={call.call_type === "video" ? "video" : "phone"}
              onPress={() => {
                if (auth.demoPhone) {
                  void markPhoneCallNotificationRead(call.id, auth.demoPhone)
                    .then(() => d.refreshUnreadNotificationCount())
                    .catch((error) => console.warn("Unable to mark call notification as read:", error));
                }
                go(`/calls/detail/${call.id}`);
              }}
            />;
          })}
        </View>;
      })}
      {!loading && !groupedMessages.length && !calls.length && (
        <Empty
          title="You’re all caught up"
          message="Messages and missed calls will appear here."
          icon="bell"
        />
      )}
    </Shell>
  );
}
export function ServiceState({ state }: { state: string }) {
  const [retried, setRetried] = useState(false);
  const names: Record<string, [string, string]> = {
    offline: ["You’re offline", "Check your connection and try again."],
    maintenance: [
      "A little tune-up",
      "Aasai Talk is temporarily unavailable. Please check back shortly.",
    ],
    update: [
      "A fresh version is waiting",
      "A newer version of Aasai Talk is available. Update the app to continue.",
    ],
    expired: ["Let’s get you signed in", "Your session has expired."],
    suspended: [
      "Account unavailable",
      "Contact support for information about your account.",
    ],
    unavailable: [
      "This content is unavailable",
      "It may have been removed or your access may have changed.",
    ],
    admin: [
      "Access unavailable",
      "This area is available only to authorised administrators.",
    ],
    loading: [
      "Getting things ready",
      "Loading your experience…",
    ],
    error: [
      "Something went wrong",
      "Your previous work is preserved. Please try again.",
    ],
  };
  const [title, message] = names[state] || names.error;
  return (
    <Shell title="Service status">
      <Empty
        icon={state === "offline" ? "wifi-off" : "alert-circle"}
        title={title}
        message={message}
      />
      {state === "loading" &&
        [1, 2, 3].map((x) => (
          <View
            key={x}
            style={{ height: 88, backgroundColor: c.high, borderRadius: 22 }}
          />
        ))}
      {retried && (
        <Notice>
          We could not reconnect. Please try again.
        </Notice>
      )}
      <Button
        title={
          state === "expired"
            ? "Sign in"
            : state === "suspended"
              ? "Contact support"
              : "Try again"
        }
        onPress={() =>
          state === "expired"
            ? go("/auth/login")
            : state === "suspended"
              ? go("/settings/help")
              : setRetried(true)
        }
      />
      <Button
        title="Back to Explore"
        variant="secondary"
        onPress={() => go("/explore")}
      />
    </Shell>
  );
}
