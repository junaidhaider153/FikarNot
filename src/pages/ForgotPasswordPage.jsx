import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../api/authApi";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { Ic } from "../components/icons";

export default function ForgotPasswordPage() {
  useDocumentMeta({ title: "Forgot password", noindex: true });
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [devResetUrl, setDevResetUrl] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setDevResetUrl("");
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const result = await authApi.forgotPassword(cleanEmail);
      setMessage(result.message || "If an account exists, a reset link has been prepared.");
      if (result.devResetUrl) setDevResetUrl(result.devResetUrl);
    } catch (err) {
      setError(err.message || "Unable to prepare password reset.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container auth-wrap">
      <div className="panel auth-panel">
        <div className="auth-intro">
          <span className="step-n">
            <Ic n="shield" s={14} />
          </span>
          <div>
            <p className="eyebrow">Account recovery</p>
            <h1 className="auth-title display">Forgot your password?</h1>
            <p className="auth-sub">Enter your account email and FikarNot will prepare a secure password reset link.</p>
          </div>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="field">
            <label className="lbl" htmlFor="forgot-email">
              Email
            </label>
            <input
              id="forgot-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          {error && (
            <p className="f-err" role="alert">
              {error}
            </p>
          )}
          {message && (
            <div className="free-note" role="status">
              {message}
            </div>
          )}
          {devResetUrl && (
            <div className="panel" style={{ marginTop: 14, background: "#F7F8FF" }}>
              <strong>Development reset link</strong>
              <p style={{ margin: "6px 0 12px", color: "var(--ink2)", fontSize: 13 }}>
                For local testing only. In production this link should be delivered by email.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-dark btn-sm"
                  onClick={() => navigate(new URL(devResetUrl).pathname + new URL(devResetUrl).search)}
                >
                  Open reset page <Ic n="arrow" s={13} />
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(devResetUrl)}>
                  Copy link
                </button>
              </div>
            </div>
          )}
          <button className="btn btn-dark auth-submit" disabled={busy}>
            {busy ? "Preparing…" : "Send reset link"} <Ic n="arrow" s={15} />
          </button>
        </form>

        <div className="auth-footnote">
          <Link to="/login">
            Back to sign in <Ic n="arrow" s={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
