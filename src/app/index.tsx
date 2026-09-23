import { Redirect, usePathname } from "expo-router";
import { useAuth } from "@/data/auth";

export default function Index() {
  const { loading, authenticated } = useAuth();
  const pathname = usePathname();
  if (loading) return null;
  if (pathname !== "/") return null;
  return <Redirect href={authenticated ? "/explore" : "/auth/splash"} />;
}
