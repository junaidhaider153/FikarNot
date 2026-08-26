import process from "node:process";

const errors = [];
const warnings = [];
const isProduction = process.env.NODE_ENV === "production";

if (!isProduction) {
  console.log("Production configuration check skipped (NODE_ENV is not production).");
  process.exit(0);
}

const requireEnv = (name) => {
  if (!String(process.env[name] || "").trim()) errors.push(`${name} is required in production.`);
};

requireEnv("FIKARNOT_FRONTEND_ORIGIN");
requireEnv("FIKARNOT_APP_URL");
requireEnv("SITE_URL");
requireEnv("RESEND_API_KEY");
requireEnv("RESEND_FROM_EMAIL");

const appUrl = String(process.env.FIKARNOT_APP_URL || "").trim();
if (appUrl && !appUrl.startsWith("https://")) errors.push("FIKARNOT_APP_URL must use HTTPS in production.");
const siteUrl = String(process.env.SITE_URL || "").trim();
if (siteUrl && !siteUrl.startsWith("https://")) errors.push("SITE_URL must use HTTPS in production.");

const origins = String(process.env.FIKARNOT_FRONTEND_ORIGIN || "")
  .split(",").map((v) => v.trim()).filter(Boolean);
for (const origin of origins) {
  if (!origin.startsWith("https://")) warnings.push(`Frontend origin is not HTTPS: ${origin}`);
}

if (process.env.FIKARNOT_ENABLE_MOCK_PAYMENTS === "1") {
  errors.push("FIKARNOT_ENABLE_MOCK_PAYMENTS must be disabled in production.");
}
if (process.env.FIKARNOT_EXPOSE_RESET_LINKS === "1") {
  errors.push("FIKARNOT_EXPOSE_RESET_LINKS must be disabled in production.");
}
if (process.env.FIKARNOT_SEED_DEMO_DATA === "1") {
  errors.push("FIKARNOT_SEED_DEMO_DATA must be disabled in production.");
}
if (process.env.FIKARNOT_DISABLE_BREACH_CHECK === "1") {
  warnings.push("Password breach checking is disabled in production.");
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);
if (errors.length) {
  console.error("Production configuration check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Production configuration check passed.");
