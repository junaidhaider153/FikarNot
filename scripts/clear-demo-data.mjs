import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.FIKARNOT_DATA_DIR ? path.resolve(process.env.FIKARNOT_DATA_DIR) : path.join(__dirname, "../server/data");
const db = new DatabaseSync(path.join(dataDir, "fikarnot.sqlite"));

if (process.argv.includes("--confirm") === false) {
  console.error("Refusing to delete demo data without --confirm.");
  console.error("Run: npm run db:clear-demo -- --confirm");
  process.exit(1);
}

const demoUserIds = ["u1", "u2", "u3"];
const demoProductIds = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
const demoCategoryIds = ["c1", "c2", "c3", "c4"];
const demoCouponIds = ["cp1", "cp2", "cp3"];

// This intentionally targets only the known seeded IDs. It does not delete real records.
db.exec("BEGIN IMMEDIATE");
try {
  for (const id of demoProductIds) db.prepare("DELETE FROM products WHERE id=?").run(id);
  for (const id of demoCategoryIds) db.prepare("DELETE FROM categories WHERE id=?").run(id);
  for (const id of demoCouponIds) db.prepare("DELETE FROM coupons WHERE id=?").run(id);
  for (const id of demoUserIds) db.prepare("DELETE FROM users WHERE id=?").run(id);
  db.prepare("DELETE FROM catalog_meta WHERE key IN ('seeded','orders_migrated','engagement_migrated')").run();
  db.prepare("DELETE FROM site_settings WHERE key IN ('heroKicker','heroEyebrow','heroTitle','heroHighlight','heroSubtitle','heroSticker')").run();
  db.exec("COMMIT");
  console.log("Known FikarNot demo records were removed. Restart the server with FIKARNOT_SEED_DEMO_DATA=0.");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
