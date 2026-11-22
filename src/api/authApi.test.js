import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: vi.fn(),
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
        unenroll: vi.fn(),
        getAuthenticatorAssuranceLevel: vi.fn(),
      },
      signInWithPassword: vi.fn(),
    },
  },
}));

const { supabase } = await import("../lib/supabaseClient");
const { authApi } = await import("./authApi");

describe("authApi MFA/TOTP helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("twoFactorStatus returns enabled=false when no verified factors exist", async () => {
    supabase.auth.mfa.listFactors.mockResolvedValueOnce({
      data: { totp: [] },
      error: null,
    });
    const status = await authApi.twoFactorStatus();
    expect(status.enabled).toBe(false);
  });

  it("twoFactorStatus returns enabled=true when verified factors exist", async () => {
    supabase.auth.mfa.listFactors.mockResolvedValueOnce({
      data: { totp: [{ id: "f-1", status: "verified" }] },
      error: null,
    });
    const status = await authApi.twoFactorStatus();
    expect(status.enabled).toBe(true);
    expect(status.factors.length).toBe(1);
  });

  it("twoFactorSetup cleans unverified factors and enrolls a new TOTP factor", async () => {
    supabase.auth.mfa.listFactors.mockResolvedValueOnce({
      data: { totp: [{ id: "f-old", status: "unverified" }] },
      error: null,
    });
    supabase.auth.mfa.unenroll.mockResolvedValueOnce({ error: null });
    supabase.auth.mfa.enroll.mockResolvedValueOnce({
      data: { id: "f-new", totp: { secret: "SEC123", uri: "otpauth://test" } },
      error: null,
    });

    const res = await authApi.twoFactorSetup();

    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: "f-old" });
    expect(supabase.auth.mfa.enroll).toHaveBeenCalledWith({ factorType: "totp" });
    expect(res).toEqual({
      secret: "SEC123",
      otpauthUrl: "otpauth://test",
      factorId: "f-new",
    });
  });

  it("twoFactorEnable challenges and verifies the code", async () => {
    supabase.auth.mfa.challenge.mockResolvedValueOnce({
      data: { id: "ch-1" },
      error: null,
    });
    supabase.auth.mfa.verify.mockResolvedValueOnce({
      data: {},
      error: null,
    });

    const res = await authApi.twoFactorEnable("f-new", "123456");
    expect(supabase.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: "f-new" });
    expect(supabase.auth.mfa.verify).toHaveBeenCalledWith({
      factorId: "f-new",
      challengeId: "ch-1",
      code: "123456",
    });
    expect(res.enabled).toBe(true);
  });

  it("twoFactorDisable unenrolls all factors", async () => {
    supabase.auth.mfa.listFactors.mockResolvedValueOnce({
      data: { totp: [{ id: "f-1" }, { id: "f-2" }] },
      error: null,
    });
    supabase.auth.mfa.unenroll.mockResolvedValue({ error: null });

    const res = await authApi.twoFactorDisable();
    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledTimes(2);
    expect(res.enabled).toBe(false);
  });

  it("exports mfa* aliases that mirror twoFactor* methods", () => {
    expect(typeof authApi.mfaStatus).toBe("function");
    expect(typeof authApi.mfaEnroll).toBe("function");
    expect(typeof authApi.mfaVerify).toBe("function");
    expect(typeof authApi.mfaUnenroll).toBe("function");
  });
});
