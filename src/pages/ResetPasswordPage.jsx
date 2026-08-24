import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../api/authApi";
import { useApp } from "../store/appStore";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { Ic } from "../components/icons";

export default function ResetPasswordPage() {
  useDocumentMeta({ title: "Reset password", noindex: true });
  const s = useApp();
  const [query] = useSearchParams();
  const token = useMemo(() => query.get("token") || "", [query]);
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    if (!token) {
      setValidating(false);
      setValid(false);
      return undefined;
    }
    authApi
      .verifyResetToken(token)
      .then(() => {
        if (alive) setValid(true);
      })
      .catch(() => {
        if (alive) setValid(false);
      })
      .finally(() => {
        if (alive) setValidating(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await authApi.resetPassword(token, password);
      const destination =
        result.user && (result.user.role === "admin" || result.user.role === "editor")
          ? "/admin"
          : result.user
            ? "/account"
            : s.session
              ? "/account"
              : "/login";
      window.location.assign(destination);
    } catch (err) {
      setError(err.message || "Unable to reset password.");
      setBusy(false);
    }
  };

  if (validating)
    return (
      <div className="container" style={{ padding: "60px 24px" }}>
        <div className="panel">Checking your reset link…</div>
      </div>
    );

  return (
    <div className="container auth-wrap">
      <div className="panel auth-panel">
        <div className="auth-intro">
          <span className="step-n">
            <Ic n="shield" s={14} />
          </span>
          <div>
            <p className="eyebrow">Account recovery</p>
            <h1 className="auth-title display">Set a new password</h1>
            <p className="auth-sub">Choose a new password with at least 8 characters.</p>
          </div>
        </div>

        {!valid ? (
          <div className="error-card" role="alert">
            <span className="empty-ic">
              <Ic n="alert" s={26} />
            </span>
            <h3 className="display">Reset link unavailable</h3>
            <p style={{ color: "var(--ink2)", margin: "6px 0 18px" }}>This link is invalid, expired, or has already been used.</p>
            <Link className="btn btn-dark" to="/forgot-password">
              Request a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label className="lbl" htmlFor="reset-pass">
                New password
              </label>
              <input
                id="reset-pass"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="reset-confirm">
                Confirm password
              </label>
              <input
                id="reset-confirm"
                className="input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="Repeat your new password"
              />
            </div>
            {error && (
              <p className="f-err" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-dark auth-submit" disabled={busy}>
              {busy ? "Updating…" : "Update password"} <Ic n="check" s={15} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
