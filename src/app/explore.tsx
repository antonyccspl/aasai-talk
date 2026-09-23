import { Discovery } from "@/ui/social";
import { Redirect } from "expo-router";
import { useAuth } from "@/data/auth";
export default function Explore() {
  const { loading, authenticated } = useAuth();
  if (loading) return null;
  if (!authenticated) return <Redirect href="/auth/login" />;
  return <Discovery />;
}
