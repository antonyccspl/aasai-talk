import {
  fetchPhoneHostCallCapabilities,
  type HostCallCapabilities,
} from "@/data/call-sessions";
import { useEffect, useState } from "react";

export function usePhoneHostCallCapabilities(
  hostPhone: string,
): HostCallCapabilities | null {
  const [capabilities, setCapabilities] =
    useState<HostCallCapabilities | null>(null);

  useEffect(() => {
    if (!/^\+91\d{10}$/.test(hostPhone)) {
      setCapabilities(null);
      return;
    }
    let active = true;
    setCapabilities(null);
    void fetchPhoneHostCallCapabilities(hostPhone)
      .then((value) => {
        if (active) setCapabilities(value);
      })
      .catch((error) => {
        console.warn("Unable to load Host call preferences:", error);
        if (active) setCapabilities(null);
      });
    return () => {
      active = false;
    };
  }, [hostPhone]);

  return capabilities;
}
