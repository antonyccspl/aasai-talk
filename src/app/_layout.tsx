import { Stack, router } from "expo-router";
import { useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { DemoProvider, useDemo } from "@/ui/store";
import { colors } from "@/ui/theme";
import { SampleWorkspaceProvider } from "@/data/sample-workspace";
import { AuthProvider, useAuth } from "@/data/auth";
import { subscribeToIncomingCalls } from "@/data/call-sessions";

function AppNavigator() {
  const { theme } = useDemo();
  const { demoPhone, loading, authenticated } = useAuth();
  const incomingSessionRef = useRef("");
  useEffect(() => {
    if (loading || !authenticated || !demoPhone) return;
    return subscribeToIncomingCalls(demoPhone, (call) => {
      if (incomingSessionRef.current === call.id) return;
      incomingSessionRef.current = call.id;
      router.replace(`/calls/incoming/phone_${call.caller_phone.replace(/^\+/, "")}?type=${call.call_type}&session=${call.id}` as never);
    });
  }, [demoPhone, loading, authenticated]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "none",
        }}
      />
    </View>
  );
}

export default function Layout() {
  return (
    <AuthProvider>
      <SampleWorkspaceProvider>
        <DemoProvider>
          <AppNavigator />
        </DemoProvider>
      </SampleWorkspaceProvider>
    </AuthProvider>
  );
}
