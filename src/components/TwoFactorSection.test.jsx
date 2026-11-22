import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TwoFactorSection } from "./TwoFactorSection";
import { authApi } from "../api/authApi";

vi.mock("../api/authApi", () => ({
  authApi: {
    twoFactorStatus: vi.fn(),
    twoFactorSetup: vi.fn(),
    twoFactorEnable: vi.fn(),
    twoFactorDisable: vi.fn(),
  },
}));

vi.mock("../store/appStore", () => ({
  appActions: {
    toast: vi.fn(),
  },
}));

describe("<TwoFactorSection />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders loading state initially then shows Disabled status", async () => {
    authApi.twoFactorStatus.mockResolvedValueOnce({ enabled: false });

    render(<TwoFactorSection />);
    expect(screen.getByText(/loading security settings/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Disabled")).toBeTruthy();
      expect(screen.getByRole("button", { name: /set up two-factor authentication/i })).toBeTruthy();
    });
  });

  it("runs setup flow: generates secret, inputs 6-digit code, and activates 2FA", async () => {
    authApi.twoFactorStatus.mockResolvedValueOnce({ enabled: false });
    authApi.twoFactorSetup.mockResolvedValueOnce({
      secret: "JBSWY3DPEHPK3PXP",
      factorId: "factor-123",
      otpauthUrl: "otpauth://totp/FikarNot?secret=JBSWY3DPEHPK3PXP",
    });
    authApi.twoFactorEnable.mockResolvedValueOnce({ enabled: true });

    render(<TwoFactorSection />);
    await waitFor(() => expect(screen.getByText("Disabled")).toBeTruthy());

    const setupBtn = screen.getByRole("button", { name: /set up two-factor authentication/i });
    fireEvent.click(setupBtn);

    await waitFor(() => {
      expect(authApi.twoFactorSetup).toHaveBeenCalledTimes(1);
      expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeTruthy();
    });

    const verifyBtn = screen.getByRole("button", { name: /verify and enable 2fa/i });
    expect(verifyBtn.disabled).toBe(true);

    const codeInput = screen.getByPlaceholderText("123456");
    fireEvent.change(codeInput, { target: { value: "123" } });
    expect(verifyBtn.disabled).toBe(true);

    fireEvent.change(codeInput, { target: { value: "123456" } });
    expect(verifyBtn.disabled).toBe(false);

    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(authApi.twoFactorEnable).toHaveBeenCalledWith("factor-123", "123456");
      expect(screen.getByText("Active")).toBeTruthy();
      expect(screen.getByText(/2fa is active/i)).toBeTruthy();
    });
  });

  it("cancels setup when Cancel button is clicked", async () => {
    authApi.twoFactorStatus.mockResolvedValueOnce({ enabled: false });
    authApi.twoFactorSetup.mockResolvedValueOnce({
      secret: "JBSWY3DPEHPK3PXP",
      factorId: "factor-123",
    });

    render(<TwoFactorSection />);
    await waitFor(() => expect(screen.getByText("Disabled")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /set up two-factor authentication/i }));
    await waitFor(() => expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByText("JBSWY3DPEHPK3PXP")).toBeNull();
      expect(screen.getByRole("button", { name: /set up two-factor authentication/i })).toBeTruthy();
    });
  });

  it("disables 2FA with confirmation when currently enabled", async () => {
    authApi.twoFactorStatus.mockResolvedValueOnce({ enabled: true });
    authApi.twoFactorDisable.mockResolvedValueOnce({ enabled: false });

    render(<TwoFactorSection />);
    await waitFor(() => expect(screen.getByText("Active")).toBeTruthy());

    const disableBtn = screen.getByRole("button", { name: "Disable 2FA" });
    fireEvent.click(disableBtn);

    expect(screen.getByText(/are you sure you want to disable two-factor authentication/i)).toBeTruthy();
    const confirmBtn = screen.getByRole("button", { name: /confirm & disable 2fa/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(authApi.twoFactorDisable).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Disabled")).toBeTruthy();
    });
  });

  it("customizes text for staff account when isStaff is true", async () => {
    authApi.twoFactorStatus.mockResolvedValueOnce({ enabled: false });

    render(<TwoFactorSection isStaff={true} />);
    await waitFor(() => {
      expect(screen.getByText(/protect your staff account/i)).toBeTruthy();
    });
  });
});
