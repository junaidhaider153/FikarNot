import { useEffect, useState } from "react";
import { authApi } from "../api/authApi";
import { appActions } from "../store/appStore";
import { Ic } from "./icons";

export function TwoFactorSection({ isStaff = false }) {
  const [status, setStatus] = useState(null);
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  useEffect(() => {
    let mounted = true;
    authApi
      .twoFactorStatus()
      .then((st) => {
        if (mounted) setStatus(st);
      })
      .catch((err) => {
        console.error("Failed to load 2FA status:", err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setup = async () => {
    setBusy(true);
    try {
      const result = await authApi.twoFactorSetup();
      setSecret(result.secret);
      setFactorId(result.factorId);
      setOtpauthUrl(result.otpauthUrl || "");
      appActions.toast("Authenticator secret generated. Add it to your authenticator app.");
    } catch (e) {
      appActions.toast(e.message || "Could not start 2FA setup", "err");
    } finally {
      setBusy(false);
    }
  };

  const cancelSetup = () => {
    setSecret("");
    setFactorId("");
    setOtpauthUrl("");
    setCode("");
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(secret);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      appActions.toast("Setup secret copied to clipboard");
    } catch {
      appActions.toast("Could not copy to clipboard", "err");
    }
  };

  const enable = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await authApi.twoFactorEnable("", factorId, code);
      setStatus({ enabled: true, required: isStaff });
      setCode("");
      setSecret("");
      setFactorId("");
      setOtpauthUrl("");
      appActions.toast("Two-factor authentication enabled successfully!");
    } catch (e) {
      appActions.toast(e.message || "Could not enable 2FA", "err");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await authApi.twoFactorDisable();
      setStatus({ enabled: false, required: false });
      setCode("");
      setShowDisableConfirm(false);
      appActions.toast("Two-factor authentication disabled");
    } catch (e) {
      appActions.toast(e.message || "Could not disable 2FA", "err");
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <div className="twofactor-section">
        <h4 className="display twofactor-title">Two-factor authentication</h4>
        <p className="field-hint">Loading security settings…</p>
      </div>
    );
  }

  const roleText = isStaff ? "staff account" : "account";

  return (
    <div className="twofactor-section">
      <div className="account-card-head" style={{ marginBottom: "8px" }}>
        <div>
          <p className="lbl">Security</p>
          <h2 className="display twofactor-title" style={{ margin: 0 }}>
            Two-factor authentication (2FA)
          </h2>
        </div>
        <span className={`account-status ${status.enabled ? "delivered" : "pending_payment"}`}>
          {status.enabled ? "Active" : "Disabled"}
        </span>
      </div>

      <p className="field-hint" style={{ marginTop: "4px" }}>
        Protect your {roleText} with an extra layer of security. When enabled, signing in will require a 6-digit verification code from
        Google Authenticator, Microsoft Authenticator, 1Password, or any standard TOTP app.
      </p>

      <div className={`free-note twofactor-status${status.enabled ? " is-on" : ""}`}>
        {status.enabled
          ? `✓ 2FA is active and protecting your ${roleText}.`
          : `2FA is not active. Enabling it is strongly recommended to keep your ${roleText} secure.`}
      </div>

      {!status.enabled && !secret && (
        <div style={{ marginTop: "14px" }}>
          <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={setup}>
            <Ic n="shield" s={14} /> {busy ? "Setting up…" : "Set up two-factor authentication"}
          </button>
        </div>
      )}

      {secret && (
        <div className="panel twofactor-secret" style={{ padding: "16px", borderRadius: "8px", marginTop: "14px" }}>
          <strong style={{ display: "block", marginBottom: "6px" }}>1. Add setup key to your authenticator app</strong>
          <p className="field-hint" style={{ marginBottom: "10px" }}>
            Open your authenticator app, choose &quot;Add account&quot; or &quot;Enter setup key&quot;, and enter this secret:
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
            <code
              className="twofactor-code-text"
              style={{ padding: "6px 10px", background: "var(--surface)", borderRadius: "4px", fontSize: "14px", letterSpacing: "1px" }}
            >
              {secret}
            </code>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copySecret}>
              <Ic n={copied ? "check" : "edit"} s={13} /> {copied ? "Copied" : "Copy key"}
            </button>
          </div>

          {otpauthUrl && (
            <p className="field-hint" style={{ marginBottom: "16px", wordBreak: "break-all" }}>
              Or use setup link: <code className="twofactor-code-text">{otpauthUrl}</code>
            </p>
          )}

          <strong style={{ display: "block", marginBottom: "6px" }}>2. Verify 6-digit code</strong>
          <p className="field-hint" style={{ marginBottom: "8px" }}>
            Enter the 6-digit code currently shown in your authenticator app to complete setup:
          </p>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", maxWidth: "320px", marginBottom: "14px" }}>
            <input
              id="twofactor-verification-code"
              className="input"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              style={{ fontSize: "18px", letterSpacing: "4px", textAlign: "center" }}
            />
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn btn-dark btn-sm" disabled={busy || code.length !== 6} onClick={enable}>
              <Ic n="check" s={14} /> {busy ? "Verifying…" : "Verify and enable 2FA"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={cancelSetup}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {status.enabled && (
        <div style={{ marginTop: "14px" }}>
          {!showDisableConfirm ? (
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => setShowDisableConfirm(true)}>
              Disable 2FA
            </button>
          ) : (
            <div className="panel" style={{ padding: "12px 16px", background: "var(--surface-soft)", borderRadius: "6px" }}>
              <p style={{ margin: "0 0 10px 0", fontSize: "13.5px" }}>
                Are you sure you want to disable two-factor authentication? Your account will only be protected by your password.
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={disable}>
                  {busy ? "Disabling…" : "Confirm & disable 2FA"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setShowDisableConfirm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
