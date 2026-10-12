import express from "express";
import { api } from "./routes.js";
import { startRollover } from "./rollover.js";

const app = express();
app.disable("x-powered-by");

// This app has no login: it is for one person on their own machine. So it must never answer to anyone else.
//  1. It listens on this computer only (not on the Wi-Fi / network).
//  2. It only accepts requests addressed to localhost, which blocks DNS-rebinding tricks from other websites.
//  3. There is no CORS: pages from other websites can't read it from the browser. The app talks to it through the
//     dev/preview server's /api proxy, which is the same origin as the page.
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
app.use((req, res, next) => {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "").toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return res.status(403).json({ error: "This app only answers on localhost" });
  next();
});

app.use(express.json());
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", api);

const port = Number(process.env.PORT ?? 4000);
const bindTo = process.env.HOST ?? "127.0.0.1";
app.listen(port, bindTo, () => {
  console.log(`API listening on ${bindTo}:${port} (this computer only)`);
  startRollover();
});
