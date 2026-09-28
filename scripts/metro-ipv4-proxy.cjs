// Expo's Windows localhost server can bind only to ::1. Android's `adb reverse`
// forwards to IPv4, so this local-only bridge forwards 127.0.0.1:8082 to Metro.
const net = require("net");

const listenPort = Number(process.env.METRO_PROXY_PORT || 8082);
const listenHost = process.env.METRO_PROXY_HOST || "127.0.0.1";

const server = net.createServer((socket) => {
  console.log("Metro IPv4 bridge accepted a device connection");
  const metro = net.connect({ host: "::1", port: 8081 });
  socket.pipe(metro);
  metro.pipe(socket);
  metro.on("error", () => socket.destroy());
  socket.on("error", () => metro.destroy());
});

server.listen(listenPort, listenHost, () => {
  console.log(`Metro IPv4 bridge listening on ${listenHost}:${listenPort}`);
});
