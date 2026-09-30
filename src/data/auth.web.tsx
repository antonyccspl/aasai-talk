import type { Session, User } from "@supabase/supabase-js";
import {
    getApps,
    initializeApp,
    type FirebaseOptions,
} from "firebase/app";
import {
    signOut as firebaseSignOut,
    getAuth,
    onAuthStateChanged,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    type ConfirmationResult,
} from "firebase/auth";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  authenticated: boolean;
  demoPhone: string | null;
  demoProfileComplete: boolean;
  loading: boolean;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, token: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const authenticatedKey = "aasai-demo-authenticated";
const phoneKey = "aasai-demo-phone";
const recaptchaElementId = "aasai-firebase-recaptcha";
const webFirebaseConfig: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "",
};
let recaptchaVerifier: RecaptchaVerifier | null = null;

function isIndianMobile(phone: string) {
  return /^\+91\d{10}$/.test(phone);
}

function isWebFirebaseConfigured() {
  return Object.values(webFirebaseConfig).every((value) => value.trim().length > 0);
}

function getFirebaseAuth() {
  if (!isWebFirebaseConfigured()) {
    throw new Error(
      "Browser phone login needs Firebase Web App settings in .env.local.",
    );
  }
  const appName = "aasai-talk-web";
  const app =
    getApps().find((candidate) => candidate.name === appName) ||
    initializeApp(webFirebaseConfig, appName);
  return getAuth(app);
}

function clearRecaptchaVerifier() {
  recaptchaVerifier?.clear();
  recaptchaVerifier = null;
}

async function saveLocalPhone(phone: string) {
  globalThis.localStorage.setItem(authenticatedKey, "true");
  globalThis.localStorage.setItem(phoneKey, phone);
}

async function clearLocalPhone() {
  globalThis.localStorage.removeItem(authenticatedKey);
  globalThis.localStorage.removeItem(phoneKey);
  globalThis.localStorage.removeItem("aasai-demo-profile-phone");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const confirmation = useRef<ConfirmationResult | null>(null);
  const [demoAuthenticated, setDemoAuthenticated] = useState(false);
  const [demoPhone, setDemoPhone] = useState<string | null>(null);
  const [demoProfileComplete, setDemoProfileComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isWebFirebaseConfigured()) {
      setLoading(false);
      return;
    }

    let active = true;
    const unsubscribe = onAuthStateChanged(
      getFirebaseAuth(),
      (firebaseUser) => {
        if (!active) return;
        const phone = firebaseUser?.phoneNumber;
        if (!phone || !isIndianMobile(phone)) {
          setDemoAuthenticated(false);
          setDemoPhone(null);
          setDemoProfileComplete(false);
          setLoading(false);
          return;
        }

        setDemoAuthenticated(true);
        setDemoPhone(phone);
        void (async () => {
          await saveLocalPhone(phone);
          const { data, error } = await supabase.rpc("open_phone_identity", {
            input_phone: phone,
          });
          if (error) throw error;
          if (active) setDemoProfileComplete(data === true);
        })()
          .catch((error) => {
            if (active)
              console.error("Failed to restore the browser phone profile:", error);
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      (error) => {
        if (!active) return;
        console.error("Failed to restore browser Firebase session:", error);
        setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const sendOtp = async (phone: string) => {
    if (!isIndianMobile(phone))
      throw new Error("Enter a valid Indian mobile number.");
    const auth = getFirebaseAuth();
    const recaptchaElement = document.getElementById(recaptchaElementId);
    if (!recaptchaElement)
      throw new Error("The browser verification widget is not ready. Try again.");

    clearRecaptchaVerifier();
    recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaElement, {
      size: "normal",
    });
    try {
      confirmation.current = await signInWithPhoneNumber(
        auth,
        phone,
        recaptchaVerifier,
      );
    } catch (error) {
      clearRecaptchaVerifier();
      throw error;
    }
  };

  const verifyOtp = async (phone: string, token: string) => {
    if (!isIndianMobile(phone))
      throw new Error("Enter a valid Indian mobile number.");
    if (!confirmation.current)
      throw new Error("Request a new verification code and try again.");

    const credential = await confirmation.current.confirm(token);
    if (credential.user.phoneNumber !== phone)
      throw new Error("The verification code does not match this phone number.");

    const { data, error } = await supabase.rpc("open_phone_identity", {
      input_phone: phone,
    });
    if (error) throw error;

    const isProfileComplete = data === true;
    await saveLocalPhone(phone);
    setDemoPhone(phone);
    setDemoProfileComplete(isProfileComplete);
    setDemoAuthenticated(true);
    confirmation.current = null;
    clearRecaptchaVerifier();
    return isProfileComplete;
  };

  const signOut = async () => {
    if (isWebFirebaseConfigured()) await firebaseSignOut(getFirebaseAuth());
    confirmation.current = null;
    clearRecaptchaVerifier();
    await clearLocalPhone();
    setDemoAuthenticated(false);
    setDemoPhone(null);
    setDemoProfileComplete(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user: null,
        session: null,
        authenticated: demoAuthenticated,
        demoPhone,
        demoProfileComplete,
        loading,
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