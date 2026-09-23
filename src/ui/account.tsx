import React, { useEffect, useRef, useState } from "react";
import { View, Platform, Pressable, TextInput } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import {
  Avatar,
  AasaiTalkMark,
  Badge,
  Button,
  Card,
  Chip,
  Chips,
  Empty,
  Field,
  go,
  Icon,
  Notice,
  Row,
  Section,
  Setting,
  Shell,
  T,
} from "./components";
import { personFor, useDemo } from "./store";
import { colors as c } from "./theme";
import { PhotoPicker } from "./photo-picker";
import { useAuth } from "@/data/auth";
import { saveDemoProfile, saveOwnProfile } from "@/data/profile";
import { fetchPhoneMessageNotifications, subscribeToAllPhoneMessages, type PhoneMessageNotification } from "@/data/chat";

function latestEligibleBirthday() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date;
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
  const [resendSeconds, setResendSeconds] = useState(30);
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
  const otpInput = useRef<TextInput>(null);
  const otpPhone = params.phone || phone;
  if (mode === "splash")
    return (
      <Shell immersive>
        <View style={{ gap: 18, paddingBottom: 12 }}>
          <View
            style={{
              minHeight: 260,
              borderRadius: 32,
              padding: 28,
              justifyContent: "center",
              alignItems: "center",
              gap: 10,
              backgroundColor: c.low,
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <View
              style={{
                width: 112,
                height: 112,
                borderRadius: 56,
                backgroundColor: c.high,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AasaiTalkMark size={64} />
            </View>
            <T mono size={11} color={c.mint} bold>
              WELCOME TO AASAI TALK
            </T>
            <T size={32} bold>
              Aasai Talk
            </T>
            <T color={c.secondary}>Meet people. Talk. Connect.</T>
          </View>
          <Badge text="People are talking now" />
          {[
            [
              "mic",
              "Instant 1-on-1 Audio",
              "Connect in seconds with real voices.",
            ],
            ["shield", "Safe & private", "Your number stays private."],
            [
              "heart",
              "Real people, real warmth",
              "Conversations at your pace.",
            ],
          ].map(([icon, title, detail]) => (
            <Card
              key={title}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: c.high,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={icon as never} color={c.mint} />
              </View>
              <View style={{ flex: 1 }}>
                <T bold size={16}>
                  {title}
                </T>
                <T size={12} color={c.secondary}>
                  {detail}
                </T>
              </View>
            </Card>
          ))}
        </View>
        <Button
          title="Get Started"
          icon="arrow-right"
          onPress={() => go("/auth/login")}
        />
        <Button
          title="Already have an account? Log in"
          variant="secondary"
          onPress={() => go("/auth/login")}
        />
      </Shell>
    );
  if (mode === "create-profile") return <ProfileEdit onboarding />;
  if (mode === "permissions") return <Permissions onboarding />;
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
        <Button title="Continue" onPress={() => go("/auth/gender")} />
        <Button
          title="Skip for now"
          variant="secondary"
          onPress={() => go("/auth/gender")}
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
            go("/auth/complete");
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
          title="Continue to Aasai Talk"
          onPress={() => {
            setBusy(true);
            void (auth.user ? saveOwnProfile(d.profile) : Promise.resolve())
              .then(() => {
                if (auth.user) return;
                if (!auth.demoPhone) throw new Error("Demo phone is missing.");
                return saveDemoProfile(auth.demoPhone, d.profile);
              })
              .then(() => {
                router.replace("/explore");
              })
              .catch((saveError) => {
                console.error(
                  "Failed to save authenticated profile:",
                  saveError,
                );
                setError("We could not save your profile. Please try again.");
              })
              .finally(() => setBusy(false));
          }}
        />
      </Shell>
    );
  return (
    <Shell title={mode === "otp" ? "Verify your number" : undefined} immersive>
      <OnboardingProgress
        step={mode === "otp" ? 2 : 1}
        label={mode === "otp" ? "Verification" : "Phone verification"}
      />
      <View style={{ paddingTop: 12, gap: 10 }}>
        <T mono size={11} color={c.mint} bold>
          {mode === "otp" ? "VERIFY YOUR NUMBER" : "PHONE VERIFICATION"}
        </T>
        <T size={30} bold>
          {mode === "otp" ? "Verify your number" : "What's your number?"}
        </T>
        <T color={c.secondary}>
          {mode === "otp"
            ? "Enter the six-digit code we sent you."
            : "We'll send you a short six-digit verification code."}
        </T>
      </View>
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
                  width: 44,
                  height: 54,
                  borderRadius: 14,
                  backgroundColor: index === code.length ? c.high : c.low,
                  borderWidth: 1,
                  borderColor: index === code.length ? c.mint : c.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <T size={20} bold>
                  {code[index] || "·"}
                </T>
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
            <T size={12} color={c.error}>
              {error}
            </T>
          )}
          <Notice>Demo OTP: 123456</Notice>
          <Button
            title={busy ? "Verifying…" : "Verify OTP"}
            disabled={busy}
            onPress={() => {
              if (code.length !== 6 || !otpPhone) {
                setError("Enter the six-digit verification code.");
                return;
              }
              setBusy(true);
              void auth
                .verifyDemoOtp(otpPhone, code)
                .then((profileComplete) =>
                  router.replace(
                    profileComplete ? "/explore" : "/auth/create-profile",
                  ),
                )
                .catch((verificationError) => {
                  console.error(
                    "Demo OTP verification failed:",
                    verificationError,
                  );
                  setError(
                    "That code is invalid or expired. Request a new code and try again.",
                  );
                })
                .finally(() => setBusy(false));
            }}
          />
          <Button
            title={
              resendSeconds > 0
                ? `Resend in 00:${String(resendSeconds).padStart(2, "0")}`
                : sent
                  ? "Resend code"
                  : "Resend code"
            }
            variant="secondary"
            disabled={resendSeconds > 0 || busy}
            onPress={() => {
              setSent(true);
              setResendSeconds(30);
              setCode("");
              setError("");
            }}
          />
          <Button
            title="Change phone number"
            variant="secondary"
            onPress={() => go("/auth/login")}
          />
        </>
      ) : (
        <>
          <Card>
            <Field
              label="Mobile number · India (+91)"
              value={phone}
              onChange={(value) => {
                setPhone(value.replace(/\D/g, "").slice(0, 10));
                setError("");
              }}
              numeric
              placeholder="98765 43210"
              error={error}
            />
            <T size={12} color={c.secondary}>
              Enter your 10-digit mobile number
            </T>
          </Card>
          <Card>
            <Row>
              <Icon name="shield" color={c.mint} />
              <View style={{ flex: 1 }}>
                <T bold color={c.mint}>
                  Private and secure
                </T>
                <T size={12} color={c.secondary}>
                  We never show your phone number to other users.
                </T>
              </View>
            </Row>
          </Card>
          <Button
            title="Continue with phone"
            icon="arrow-right"
            onPress={() => {
              if (!/^\d{10}$/.test(phone)) {
                setError("Enter a valid 10-digit mobile number.");
                return;
              }
              const formattedPhone = `+91${phone}`;
              setError("");
              setResendSeconds(30);
              router.push({
                pathname: "/[...route]",
                params: { route: ["auth", "otp"], phone: formattedPhone },
              });
            }}
          />
          <T size={12} color={c.muted}>
            By continuing, you agree to the Terms and Privacy Policy.
          </T>
          <Row>
            <Button
              title="Terms"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => go("/settings/policies/terms")}
            />
            <Button
              title="Privacy"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => go("/settings/policies/privacy")}
            />
          </Row>
        </>
      )}
    </Shell>
  );
}
export function ProfileEdit({ onboarding }: { onboarding?: boolean }) {
  const d = useDemo();
  const auth = useAuth();
  const [form, setForm] = useState(() =>
    onboarding ? { ...d.profile, name: "", username: "" } : d.profile,
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
      {avatar && <PhotoPicker uri={d.photo} onChange={d.setPhoto} />}
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
      {error && <Notice error>{error}</Notice>}
      {saved && <Notice>Profile saved.</Notice>}
      <Button
        title={busy ? "Saving…" : onboarding ? "Continue" : "Save changes"}
        disabled={busy}
        onPress={() => {
          if (!form.name.trim() || !/^[a-zA-Z0-9_]{3,20}$/.test(form.username))
            return setError("Enter your name and a 3–20 character username.");
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(form.dob) ||
            Number.isNaN(Date.parse(form.dob)) ||
            !form.languages.length
          )
            return setError(
              "Choose a valid date of birth and select at least one language.",
            );
          setBusy(true);
          void (
            auth.user
              ? saveOwnProfile(form)
              : auth.demoPhone
                  ? saveDemoProfile(auth.demoPhone, { ...form, photo: d.photo })
                : Promise.reject(new Error("Demo phone is missing."))
          )
            .then(() => {
              d.setProfile(form);
              setError("");
              setSaved(true);
              if (onboarding) go("/auth/permissions");
            })
            .catch((saveError) => {
              console.error("Failed to save profile:", saveError);
              setError(
                "We could not save your profile. Check your details and try again.",
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
            d.active
              ? "Busy · in a call"
              : d.available
                ? "Available for a conversation"
                : "Unavailable"
          }
          warning={!!d.active || !d.available}
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
      {d.profile.gender === "Female" && d.hostStatus === "approved" && (
        <Setting
          title="Availability"
          detail="Choose when to connect"
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
          title="Continue to Explore"
          onPress={() => router.replace("/explore" as never)}
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
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [question, setQuestion] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [otherDeleteReason, setOtherDeleteReason] = useState("");
  const [refreshing, setRefreshing] = useState(false);
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
  if (mode === "theme")
    return (
      <Shell title="Theme">
        <Card>
          <T size={18} bold>
            Choose your appearance
          </T>
          <T color={c.secondary}>
            Aasai Talk changes colour instantly when you switch it.
          </T>
          <Setting
            title="Dark mode"
            detail={
              d.theme === "dark"
                ? "Dark appearance is active"
                : "Light appearance is active"
            }
            icon="moon"
            value={d.theme === "dark"}
            onToggle={(isDark) => d.setTheme(isDark ? "dark" : "light")}
          />
        </Card>
      </Shell>
    );
  if (
    mode === "availability" &&
    d.profile.gender === "Female" &&
    d.hostStatus === "approved"
  )
    return (
      <Shell title="Your availability">
        <T size={24} bold>
          Connect on your terms.
        </T>
        <Setting
          title="Available for calls"
          detail={
            d.active
              ? "Busy while your call is active"
              : "Let people know you are ready to talk"
          }
          value={d.available}
          onToggle={(v) =>
            d.active
              ? setMessage(
                  "End your current call before changing availability.",
                )
              : d.setAvailable(v)
          }
          icon="radio"
        />
        {message && <Notice>{message}</Notice>}
        <Notice>Changes update your availability.</Notice>
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
        <T color={c.secondary}>Choose how you connect.</T>
        {names.map((x) => (
          <Setting
            key={x}
            title={x}
            value={d.prefs[x]}
            onToggle={(v) => d.setPrefs((p) => ({ ...p, [x]: v }))}
            icon={mode === "privacy" ? "shield" : "bell"}
          />
        ))}
        <Notice>Manage how your profile and activity are shared.</Notice>
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
    return (
      <Shell
        title={`${(policy || "Privacy")[0].toUpperCase()}${(policy || "privacy").slice(1)} policy`}
      >
        <Badge text="OFFICIAL POLICY · DATABASE SYNCED" />
        <T size={24} bold>
          {policy === "terms"
            ? "Terms of Service"
            : policy === "community"
              ? "Community Guidelines"
              : policy === "safety"
                ? "Safety Center"
                : policy === "refund"
                  ? "Refund and Payment Policy"
                  : "Privacy Policy"}
        </T>
        <Notice>
          Official Talkative community and legal policy fetched live from
          Supabase.
        </Notice>
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
            <T color={c.secondary}>Policy details loading from database...</T>
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
              `Reach our 24/7 support desk at ${d.appConfig?.support_email || "support@talkative.app"} or call ${d.appConfig?.support_phone || "+91 98765 43210"}.`,
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
              : "Your account will be scheduled for deletion. Your profile, conversations and personal data will be cleared after 15 days."
          }
        />
        {d.active && (
          <Notice error>An ongoing demo call must be ended first.</Notice>
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
              After you submit, your account enters a 15-day deletion period.
              Your profile, conversations and personal data will be cleared at
              the end of that period.
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
              d.setDeletionRequest({
                reason: deleteReason,
                details: otherDeleteReason.trim(),
                requestedAt: new Date().toISOString(),
              });
              setMessage(
                "Your deletion request is saved. The intended retention period is 15 days; automatic deletion is not enabled in this sample environment.",
              );
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
      {[
        ["Theme", "settings/theme"],
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
  const p = personFor(id);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [success, setSuccess] = useState(false);
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
              ? "They will become eligible for future chats and calls in this preview."
              : "They will be removed from your discovery results. Chat and call actions with them will be disabled in this preview."
          }
        />
        <Button
          title={blocked ? "Unblock" : "Block person"}
          variant={blocked ? "primary" : "danger"}
          onPress={() => {
            d.setBlocked((v) =>
              blocked ? v.filter((x) => x !== id) : [...v, id],
            );
            router.replace(`/user/${id}` as never);
          }}
        />
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
            message="Your report has been added to this workspace for review."
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
          <Button
            title="Submit report"
            disabled={!reason || (reason === "Other" && !description.trim())}
            onPress={() => {
              d.submitSafetyReport(p.id, p.name, reason, description.trim());
              setSuccess(true);
            }}
          />
        </>
      )}
    </Shell>
  );
}
export function Notifications() {
  const auth = useAuth();
  const [filter, setFilter] = useState("All");
  const [items, setItems] = useState<PhoneMessageNotification[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!auth.demoPhone) return;
    let active = true;
    const load = () => fetchPhoneMessageNotifications(auth.demoPhone!)
      .then((rows) => { if (active) setItems(rows); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load notifications."); });
    void load();
    const unsubscribe = subscribeToAllPhoneMessages(auth.demoPhone, () => { void load(); });
    return () => { active = false; unsubscribe(); };
  }, [auth.demoPhone]);
  const list = items.filter((x) => filter !== "Unread" || !x.read_at);
  return (
    <Shell title="Notifications">
      <Chips items={["All", "Unread"]} selected={filter} onChange={setFilter} />
      {error ? <Notice error>{error}</Notice> : null}
      {list.map((x) => (
        <Setting
          key={x.id}
          title={`${x.read_at ? "" : "• "}New message`}
          detail={x.text}
          icon="message-circle"
          onPress={() => {
            go(`/chat/phone_${x.sender_phone.replace("+", "")}`);
          }}
        />
      ))}
      {!list.length && (
        <Empty
          title="You’re all caught up"
          message="New updates will appear here."
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
      "Update Aasai Talk to continue. The store destination is not configured in this preview.",
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
    loading: [
      "Getting things ready",
      "This is the reusable loading-state preview.",
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
          This is a static failure-state preview. Service checks are not
          connected.
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
