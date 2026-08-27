import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.FIKARNOT_DATA_DIR
  ? path.resolve(process.env.FIKARNOT_DATA_DIR)
  : path.join(__dirname, "../server/data");
const dbPath = path.join(dataDir, "fikarnot.sqlite");
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const backupDir = path.resolve(process.env.FIKARNOT_BACKUP_DIR || path.join(dataDir, "backups"));
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `fikarnot-${stamp}.sqlite`);

const db = new DatabaseSync(dbPath);
try {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  const escaped = backupPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);
  console.log(`Database backup created: ${backupPath}`);
} finally {
  db.close();
}

const retentionDays = Math.max(1, Number(process.env.FIKARNOT_BACKUP_RETENTION_DAYS || 30));
const cutoff = Date.now() - retentionDays * 864e5;
for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".sqlite")) continue;
  const full = path.join(backupDir, entry.name);
  if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
}
const uploadUrl = String(process.env.FIKARNOT_BACKUP_UPLOAD_URL || "").trim();
if (uploadUrl) {
  const bytes = fs.readFileSync(backupPath);
  const headers = { "Content-Type": "application/x-sqlite3", "X-FikarNot-Backup-Name": path.basename(backupPath) };
  if (process.env.FIKARNOT_BACKUP_UPLOAD_TOKEN) headers.Authorization = `Bearer ${process.env.FIKARNOT_BACKUP_UPLOAD_TOKEN}`;
  const response = await fetch(uploadUrl, { method: "PUT", headers, body: bytes });
  if (!response.ok) throw new Error(`Backup upload failed with HTTP ${response.status}`);
  console.log(`Off-box backup upload succeeded: ${uploadUrl}`);
}
