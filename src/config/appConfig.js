export const APP_NAME = "FikarNot";
export const APP_DESCRIPTION = "Thoughtful everyday objects, selected with intention.";

export const ROLES = Object.freeze({
  ADMIN: "admin",
  EDITOR: "editor",
  CUSTOMER: "customer",
});

export const STAFF_ROLES = Object.freeze([ROLES.ADMIN, ROLES.EDITOR]);
export const ADMIN_ROLES = Object.freeze([ROLES.ADMIN]);

export const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || "";

// Features that are not wired up on the Supabase backend yet. They stay hidden
// until the matching VITE_ENABLE_* variable is "true" AND the server supports it.
const flag = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase() === "true";
export const FEATURES = Object.freeze({
  payfast: flag(import.meta.env.VITE_ENABLE_PAYFAST),
  aiChat: flag(import.meta.env.VITE_ENABLE_AI_CHAT),
  videoUpload: flag(import.meta.env.VITE_ENABLE_VIDEO_UPLOAD),
});
