export const APP_NAME = "FikarNot";
export const APP_DESCRIPTION = "Thoughtful everyday objects, selected with intention.";

export const ROLES = Object.freeze({
  ADMIN: "admin",
  EDITOR: "editor",
  CUSTOMER: "customer",
});

export const STAFF_ROLES = Object.freeze([ROLES.ADMIN, ROLES.EDITOR]);
export const ADMIN_ROLES = Object.freeze([ROLES.ADMIN]);
