// Service worker: shows notifications sent by the server (web push) and opens the game when one is tapped.
// It caches nothing, so a new deploy is always what players get.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Mauritius Life", { body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag || "mauritius-life", data: { url: d.url || "./" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => { for (const c of list) if ("focus" in c) return c.focus(); return self.clients.openWindow(url); }));
});
