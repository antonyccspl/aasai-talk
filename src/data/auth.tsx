import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  authenticated: boolean;
  demoPhone: string | null;
  demoProfileComplete: boolean;
  loading: boolean;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, token: string) => Promise<void>;
  verifyDemoOtp: (phone: string, token: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [demoAuthenticated, setDemoAuthenticated] = useState(false);
  const [demoPhone, setDemoPhone] = useState<string | null>(null);
  const [demoProfileComplete, setDemoProfileComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const demoStorage = Platform.OS === "web"
        ? Promise.resolve({
            authenticated: globalThis.localStorage.getItem("aasai-demo-authenticated"),
            phone: globalThis.localStorage.getItem("aasai-demo-phone"),
            profileCompletePhone: globalThis.localStorage.getItem(
              "aasai-demo-profile-phone",
            ),
          })
        : Promise.all([
            SecureStore.getItemAsync("aasai-demo-authenticated"),
            SecureStore.getItemAsync("aasai-demo-phone"),
            SecureStore.getItemAsync("aasai-demo-profile-phone"),
          ]).then(([authenticated, phone, profileCompletePhone]) => ({
            authenticated,
            phone,
            profileCompletePhone,
          }));
      const demoValue = await demoStorage;
      let sessionResult: Awaited<ReturnType<typeof supabase.auth.getSession>>;
      try {
        sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>>(
            (_, reject) =>
              setTimeout(
                () => reject(new Error("Session restore timed out.")),
                8000,
              ),
          ),
        ]);
      } catch (error) {
        console.error("Supabase session restore failed:", error);
        sessionResult = {
          data: { session: null },
          error: null,
        };
      }
      if (sessionResult.error)
        console.error("Failed to restore Supabase session:", sessionResult.error);
      if (active) {
        setSession(sessionResult.data.session);
        setDemoAuthenticated(demoValue.authenticated === "true");
        setDemoPhone(demoValue.phone);
        setDemoProfileComplete(
          Boolean(
            demoValue.phone &&
            demoValue.profileCompletePhone === demoValue.phone,
          ),
        );
      }
    };
    void restore()
      .catch((error) => {
        console.error("Failed to restore authentication:", error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const sendOtp = async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw error;
  };

  const verifyOtp = async (phone: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });
    if (error) throw error;
  };

  const verifyDemoOtp = async (phone: string, token: string) => {
    if (!/^\+91\d{10}$/.test(phone) || token !== "123456")
      throw new Error("Invalid demo OTP.");
    setDemoAuthenticated(true);
    setDemoPhone(phone);
    let profileComplete: unknown;
    try {
      const result = await supabase.rpc("open_phone_identity", {
        input_phone: phone,
      });
      if (result.error) throw result.error;
      profileComplete = result.data;
    } catch (error) {
      setDemoAuthenticated(false);
      throw error;
    }
    const isProfileComplete = profileComplete === true;
    if (Platform.OS === "web")
      globalThis.localStorage.setItem("aasai-demo-authenticated", "true");
    else await SecureStore.setItemAsync("aasai-demo-authenticated", "true");
    if (Platform.OS === "web")
      globalThis.localStorage.setItem("aasai-demo-phone", phone);
    else await SecureStore.setItemAsync("aasai-demo-phone", phone);
    setDemoProfileComplete(isProfileComplete);
    setDemoAuthenticated(true);
    return isProfileComplete;
  };

  const signOut = async () => {
    if (session) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    if (Platform.OS === "web")
      globalThis.localStorage.removeItem("aasai-demo-authenticated");
    else await SecureStore.deleteItemAsync("aasai-demo-authenticated");
    if (Platform.OS === "web") {
      globalThis.localStorage.removeItem("aasai-demo-phone");
      globalThis.localStorage.removeItem("aasai-demo-profile-phone");
    } else {
      await SecureStore.deleteItemAsync("aasai-demo-phone");
      await SecureStore.deleteItemAsync("aasai-demo-profile-phone");
    }
    setDemoAuthenticated(false);
    setDemoPhone(null);
    setDemoProfileComplete(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        authenticated: Boolean(session || demoAuthenticated),
        demoPhone,
        demoProfileComplete,
        loading,
        sendOtp,
        verifyOtp,
        verifyDemoOtp,
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
