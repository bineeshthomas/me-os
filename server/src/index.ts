import express from "express";
import cors from "cors";
import { api } from "./routes.js";
import { startRollover } from "./rollover.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", api);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`API listening on :${port}`);
  startRollover();
});
