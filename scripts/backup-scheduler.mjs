import { spawn } from "node:child_process";
import process from "node:process";

const intervalHours = Math.max(1, Number(process.env.FIKARNOT_BACKUP_INTERVAL_HOURS || 24));
const backup = () => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [new URL("./backup-db.mjs", import.meta.url).pathname], { stdio: "inherit", env: process.env });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Backup exited with code ${code}`)));
});

const run = async () => {
  try { await backup(); } catch (error) { console.error("[FikarNot] Scheduled backup failed:", error.message); }
};
await run();
setInterval(() => { void run(); }, intervalHours * 3600_000);
