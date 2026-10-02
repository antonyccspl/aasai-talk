import {
    signOut as firebaseSignOut,
    getAuth,
    onAuthStateChanged,
    signInWithPhoneNumber,
    type ConfirmationResult,
} from "@react-native-firebase/auth";
import type { Session, User } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { unregisterPushDevice } from "./push-notifications";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { supabase } from "./supabase";

type AuthContextValue = {
  /** Supabase stays in use for app data; Firebase owns phone authentication. */
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
const authenticatedKey = "aasai-demo-authenticated";
const phoneKey = "aasai-demo-phone";
const profilePhoneKey = "aasai-demo-profile-phone";

function isIndianMobile(phone: string) {
  return /^\+91\d{10}$/.test(phone);
}

async function saveLocalPhone(phone: string) {
  if (Platform.OS === "web") {
    globalThis.localStorage.setItem(authenticatedKey, "true");
    globalThis.localStorage.setItem(phoneKey, phone);
    return;
  }
  await SecureStore.setItemAsync(authenticatedKey, "true");
  await SecureStore.setItemAsync(phoneKey, phone);
}

async function clearLocalPhone() {
  if (Platform.OS === "web") {
    globalThis.localStorage.removeItem(authenticatedKey);
    globalThis.localStorage.removeItem(phoneKey);
    globalThis.localStorage.removeItem(profilePhoneKey);
    return;
  }
  await Promise.all([
    SecureStore.deleteItemAsync(authenticatedKey),
    SecureStore.deleteItemAsync(phoneKey),
    SecureStore.deleteItemAsync(profilePhoneKey),
  ]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const confirmation = useRef<ConfirmationResult | null>(null);
  const [demoAuthenticated, setDemoAuthenticated] = useState(false);
  const [demoPhone, setDemoPhone] = useState<string | null>(null);
  const [demoProfileComplete, setDemoProfileComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Firebase Phone Authentication is native-only. The web preview remains
    // signed out instead of falling back to another OTP provider.
    if (Platform.OS === "web") {
      setLoading(false);
      return () => { active = false; };
    }

    const unsubscribe = onAuthStateChanged(getAuth(), (firebaseUser) => {
      if (!active) return;
      if (!firebaseUser?.phoneNumber) {
        setDemoAuthenticated(false);
        setDemoPhone(null);
        setDemoProfileComplete(false);
        setLoading(false);
        return;
      }
      const phone = firebaseUser.phoneNumber;
      setDemoAuthenticated(true);
      setDemoPhone(phone);
      void Promise.all([
        saveLocalPhone(phone),
        SecureStore.getItemAsync(profilePhoneKey),
      ])
        .then(([, profilePhone]) => {
          if (active) setDemoProfileComplete(profilePhone === phone);
        })
        .catch((error) =>
          console.error("Failed to restore Firebase phone session:", error),
        )
        .finally(() => {
          if (active) setLoading(false);
        });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const sendOtp = async (phone: string) => {
    if (!isIndianMobile(phone))
      throw new Error("Enter a valid Indian mobile number.");
    if (Platform.OS === "web")
      throw new Error("Firebase phone login is available in the Android app, not the web preview.");
    confirmation.current = await signInWithPhoneNumber(getAuth(), phone);
  };

  const verifyOtp = async (phone: string, token: string) => {
    if (!isIndianMobile(phone))
      throw new Error("Enter a valid Indian mobile number.");
    if (Platform.OS === "web")
      throw new Error("Firebase phone login is available in the Android app, not the web preview.");
    if (!confirmation.current)
      throw new Error("Request a new verification code and try again.");

    const credential = await confirmation.current.confirm(token);
    if (credential.user.phoneNumber !== phone)
      throw new Error("The verification code does not match this phone number.");

    // Supabase remains the database and call/message backend. This RPC keeps
    // the existing phone profile, but Supabase is no longer used for OTP.
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
    return isProfileComplete;
  };

  const signOut = async () => {
    if (Platform.OS !== "web" && getAuth().currentUser) {
      try {
        await unregisterPushDevice(await getAuth().currentUser!.getIdToken());
      } catch (error) {
        console.warn("Unable to unregister this push device:", error);
      }
    }
    if (Platform.OS !== "web") await firebaseSignOut(getAuth());
    confirmation.current = null;
    await clearLocalPhone();
    setDemoAuthenticated(false);
    setDemoPhone(null);
    setDemoProfileComplete(false);
  };

  const getIdentityToken = useCallback(async () => {
    const firebaseUser = getAuth().currentUser;
    if (!firebaseUser) throw new Error("You must be signed in to continue.");
    return firebaseUser.getIdToken();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: null,
        session: null,
        authenticated: demoAuthenticated,
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
