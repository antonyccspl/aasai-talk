import type { Session, User } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import { endHostAvailability } from "./host-presence";
import {
  unregisterBrowserCallPush,
  unregisterPushDevice,
} from "./push-notifications";

type AuthContextValue = {
  /** App profiles remain phone-keyed; Supabase Auth provides the session. */
  user: User | null;
  session: Session | null;
  authenticated: boolean;
  demoPhone: string | null;
  demoProfileComplete: boolean;
  loading: boolean;
  getIdentityToken: () => Promise<string>;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, token: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const legacyPhoneKeys = [
  "aasai-demo-authenticated",
  "aasai-demo-phone",
  "aasai-demo-profile-phone",
];

function normalizeIndianMobile(phone: string | null | undefined) {
  if (typeof phone !== "string") return null;
  const compactPhone = phone.trim().replace(/[\s()-]/g, "");
  const match = /^(?:\+?91)?(\d{10})$/.exec(compactPhone);
  return match ? `+91${match[1]}` : null;
}

async function clearLegacyPhoneState() {
  if (Platform.OS === "web") {
    for (const key of legacyPhoneKeys) globalThis.localStorage.removeItem(key);
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await Promise.all(
    legacyPhoneKeys.map((key) => SecureStore.deleteItemAsync(key)),
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [demoPhone, setDemoPhone] = useState<string | null>(null);
  const [demoProfileComplete, setDemoProfileComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const activePhoneRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    void clearLegacyPhoneState().catch((error) =>
      console.warn("Unable to clear legacy local phone auth state:", error),
    );

    const applySession = (nextSession: Session | null) => {
      const phone = normalizeIndianMobile(nextSession?.user.phone);
      if (!nextSession || !phone) {
        activePhoneRef.current = null;
        setUser(null);
        setSession(null);
        setAuthenticated(false);
        setDemoPhone(null);
        setDemoProfileComplete(false);
        setLoading(false);
        return;
      }

      const phoneChanged = activePhoneRef.current !== phone;
      activePhoneRef.current = phone;
      setUser(nextSession.user);
      setSession(nextSession);
      setAuthenticated(true);
      setDemoPhone(phone);
      if (phoneChanged) setLoading(true);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) applySession(nextSession);
    });

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (active) applySession(data.session);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Failed to restore Supabase phone session:", error);
        setLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!demoPhone) return;
    let active = true;

    void (async () => {
      try {
        const { data, error } = await supabase.rpc("open_phone_identity", {
          input_phone: demoPhone,
        });
        if (error) throw error;
        if (active) setDemoProfileComplete(data === true);
      } catch (error) {
        if (active) {
          console.error("Failed to load the phone profile state:", error);
          setDemoProfileComplete(false);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [demoPhone]);

  const sendOtp = async (phone: string) => {
    const normalizedPhone = normalizeIndianMobile(phone);
    if (!normalizedPhone)
      throw new Error("Enter a valid Indian mobile number.");
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
    });
    if (error) throw error;
  };

  const verifyOtp = async (phone: string, token: string) => {
    const normalizedPhone = normalizeIndianMobile(phone);
    if (!normalizedPhone)
      throw new Error("Enter a valid Indian mobile number.");
    const {
      data: { session: verifiedSession, user: verifiedUser },
      error,
    } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token,
      type: "sms",
    });
    if (error) throw error;
    if (!verifiedSession || !verifiedUser)
      throw new Error("Phone verification did not create an authenticated session.");
    if (normalizeIndianMobile(verifiedUser.phone) !== normalizedPhone) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      throw new Error("The verification code does not match this phone number.");
    }

    const { data, error: identityError } = await supabase.rpc(
      "open_phone_identity",
      { input_phone: normalizedPhone },
    );
    if (identityError) throw identityError;

    setUser(verifiedUser);
    setSession(verifiedSession);
    setAuthenticated(true);
    setDemoPhone(normalizedPhone);
    setDemoProfileComplete(data === true);
    setLoading(false);
    return data === true;
  };

  const signOut = async () => {
    const token = session?.access_token;

    if (token && Platform.OS === "web") {
      void endHostAvailability(token).catch((error) =>
        console.warn("Unable to end Host availability during sign-out:", error),
      );
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator)
        void unregisterBrowserCallPush(token).catch((error) =>
          console.warn(
            "Unable to unregister browser call notifications during sign-out:",
            error,
          ),
        );
    } else if (token) {
      void unregisterPushDevice(token).catch((error) =>
        console.warn("Unable to unregister this push device during sign-out:", error),
      );
    }

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  };

  const getIdentityToken = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token || !normalizeIndianMobile(data.session?.user.phone))
      throw new Error("You must be signed in to continue.");
    return token;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        authenticated,
        demoPhone,
        demoProfileComplete,
        loading,
        getIdentityToken,
        sendOtp,
        verifyOtp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider required");
  return value;
}
