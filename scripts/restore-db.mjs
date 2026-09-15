import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const source = path.resolve(process.argv[2] || "");
const dataDir = process.env.FIKARNOT_DATA_DIR ? path.resolve(process.env.FIKARNOT_DATA_DIR) : path.resolve("server/data");
const target = path.join(dataDir, "fikarnot.sqlite");
if (!source || !fs.existsSync(source)) { console.error("Usage: node scripts/restore-db.mjs /path/to/backup.sqlite"); process.exit(1); }
if (fs.existsSync(target)) fs.copyFileSync(target, `${target}.before-restore-${Date.now()}`);
const db = new DatabaseSync(source, { readOnly: true });
try { db.prepare("PRAGMA integrity_check").get(); } finally { db.close(); }
fs.copyFileSync(source, target);
console.log(`Database restored from ${source}`);
