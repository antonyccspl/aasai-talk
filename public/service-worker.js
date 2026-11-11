self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (error) {
    console.error("Ignoring malformed incoming-call notification:", error);
    return;
  }

  if (payload.type !== "incoming_call") return;
  if (typeof payload.expiresAt === "string" && Date.parse(payload.expiresAt) <= Date.now()) return;
  const route =
    typeof payload.route === "string" && /^\/calls(?:\/|$)/.test(payload.route)
      ? payload.route
      : "/calls";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (clients.some((client) => client.visibilityState === "visible")) return;
      return self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/aasai-talk-icon.png",
        badge: "/favicon.ico",
        tag: `incoming-call-${payload.callId}`,
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: [500, 250, 500, 250, 500],
        timestamp: Date.now(),
        data: { route },
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route = event.notification.data?.route;
  if (typeof route !== "string" || !/^\/calls(?:\/|$)/.test(route)) return;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const target = new URL(route, self.location.origin).href;
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
