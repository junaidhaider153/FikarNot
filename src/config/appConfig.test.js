import { describe, expect, it } from "vitest";
import { FEATURES, STAFF_ROLES, ADMIN_ROLES } from "./appConfig";

describe("appConfig", () => {
  it("keeps unported features OFF unless explicitly enabled", () => {
    expect(FEATURES).toEqual({ payfast: false, aiChat: false, videoUpload: false });
  });
  it("admin is a subset of staff", () => {
    for (const role of ADMIN_ROLES) expect(STAFF_ROLES).toContain(role);
  });
});
