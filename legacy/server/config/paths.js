import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.FIKARNOT_DATA_DIR ? path.resolve(process.env.FIKARNOT_DATA_DIR) : path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const uploadsDir = path.join(dataDir, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
const dbPath = path.join(dataDir, "fikarnot.sqlite");

export { __dirname, dataDir, uploadsDir, dbPath };
