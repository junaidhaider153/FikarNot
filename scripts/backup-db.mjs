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
