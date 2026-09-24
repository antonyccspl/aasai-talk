import React from "react";
import { useLocalSearchParams, Redirect, router } from "expo-router";
import {
  Discovery,
  Filters,
  UserProfile,
  Conversations,
  Chat,
} from "@/ui/social";
import {
  Auth,
  Profile,
  ProfileEdit,
  Settings,
  Safety,
  Notifications,
  ServiceState,
} from "@/ui/account";
import { CallScreen, CallsList, CallDetail } from "@/ui/calls";
import { Wallet } from "@/ui/wallet";
import { Preview } from "@/ui/preview";
import { Admin } from "@/ui/admin";
import { HostApplication, HostStatus, HostWithdrawals } from "@/ui/host";
import { useAuth } from "@/data/auth";

export default function Route() {
  const { loading, authenticated, demoPhone } = useAuth();
  const params = useLocalSearchParams<{
    route: string[];
    type?: string;
    status?: string;
    session?: string;
  }>();
  const parts = Array.isArray(params.route)
    ? params.route
    : [params.route || ""];
  const [root, action, id] = parts;
  if (loading) return null;
  if (
    !authenticated &&
    !demoPhone &&
    root !== "auth" &&
    !(root === "settings" && action === "policies")
  )
    return <Redirect href="/auth/login" />;
  const key = `${parts.join("/")}:${params.session || ""}`;
  let screen: React.ReactNode;
  if (root === "auth") screen = <Auth mode={action} />;
  else if (root === "host")
    screen =
      action === "status" ? (
        <HostStatus />
      ) : action === "withdraw" || action === "withdraw-preview" ? (
        <HostWithdrawals preview={action === "withdraw-preview"} />
      ) : (
        <HostApplication />
      );
  else if (root === "search" || root === "favorites")
    screen = <Discovery mode={root} />;
  else if (root === "filters") screen = <Filters />;
  else if (root === "user") screen = <UserProfile id={action} />;
  else if (root === "messages") screen = <Conversations />;
  else if (root === "chat") screen = <Chat id={action} />;
  else if (root === "calls")
    screen = !action ? (
      <CallsList />
    ) : action === "detail" || action === "result" ? (
      <CallDetail id={id} result={action === "result"} status={params.status} />
    ) : (
      <CallScreen mode={action} id={id} type={params.type} sessionId={params.session} />
    );
  else if (root === "wallet")
    screen = <Wallet mode={action || "wallet"} id={id} />;
  else if (root === "profile")
    screen =
      action === "edit" ? (
        <ProfileEdit />
      ) : action === "availability" ? (
        <Settings mode="availability" />
      ) : (
        <Profile />
      );
  else if (root === "settings")
    screen = <Settings mode={action || "settings"} policy={id} />;
  else if (root === "notifications") screen = <Notifications />;
  else if (root === "block" || root === "report" || root === "rate")
    screen = <Safety mode={root} id={action} />;
  else if (root === "status") screen = <ServiceState state={action} />;
  else if (root === "admin")
    screen = <Admin page={action || "dashboard"} id={id} />;
  else if (root === "preview") screen = <Preview />;
  else screen = <ServiceState state="unavailable" />;
  return <React.Fragment key={key}>{screen}</React.Fragment>;
}
