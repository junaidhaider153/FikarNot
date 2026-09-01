import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { Ic } from "../components/icons";

export default function LoginPage() {
  const s = useApp();
  useDocumentMeta({ title: "Sign in", noindex: true });
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [totp, setTotp] = useState("");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [verificationNotice, setVerificationNotice] = useState(null);
  const [resending, setResending] = useState(false);
  const [devVerificationUrl, setDevVerificationUrl] = useState("");
  const redirect = query.get("redirect");
  const submittedRef = useRef(false);

  useEffect(() => {
    if (s.session && !submittedRef.current) navigate(redirect || "/account", { replace: true });
  }, [s.session, redirect, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErr("Please enter a valid email address");
      return;
    }
    if (!pass) {
      setErr("Please enter your password");
      return;
    }
    if (mode === "register" && name.trim().length < 2) {
      setErr("Please enter your name");
      return;
    }
    if (mode === "register" && pass.length < 8) {
      setErr("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    submittedRef.current = true;
    let result = null;
    if (mode === "login") {
      try {
        result = await appActions.login(cleanEmail, pass, totp);
      } catch (error) {
        if (error?.code === "EMAIL_NOT_VERIFIED") {
          setVerificationNotice(cleanEmail);
        }
      }
    } else {
      result = await appActions.register(name, cleanEmail, pass);
      if (result?.requiresVerification) {
        setVerificationNotice(cleanEmail);
        setDevVerificationUrl(result.devVerificationUrl || "");
      }
    }
    setBusy(false);
    if (result?.role) navigate(redirect || (result.role === "admin" || result.role === "editor" ? "/admin" : "/account"), { replace: true });
  };

  const demo = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGIN === "1" ? [
    { label: "Admin", e: "junaid@fikarnot.shop", p: "admin123" },
    { label: "Editor", e: "editor@fikarnot.shop", p: "editor123" },
    { label: "Customer", e: "urwa@fikarnot.shop", p: "maya123" },
  ] : [];

  return (
    <div className="container auth-wrap">
      <div className="panel auth-panel">
        <div className="auth-intro">
          <span className="step-n">
            <Ic n="user" s={14} />
          </span>
          <div>
            <p className="eyebrow">FikarNot account</p>
            <h1 className="auth-title display">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="auth-sub">
              {mode === "login"
                ? "Sign in to view your orders and manage your account."
                : "Create an account to keep your details and orders in one place."}
            </p>
          </div>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "on" : ""}
            onClick={() => {
              setMode("login");
              setErr("");
              setTwoFactorRequired(false);
              setTotp("");
            }}
          >
            Sign in
          </button>
          <button
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "on" : ""}
            onClick={() => {
              setMode("register");
              setErr("");
              setTwoFactorRequired(false);
              setTotp("");
            }}
          >
            Register
          </button>
        </div>

        {redirect && (
          <div className="free-note" style={{ background: "#F1EDE2", color: "var(--ink2)" }}>
            Sign in to continue to <b>{redirect}</b>
          </div>
        )}

        <form onSubmit={submit} noValidate>
          {mode === "register" && (
            <div className="field">
              <label className="lbl" htmlFor="r-name">
                Name
              </label>
              <input
                id="r-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Your name"
              />
            </div>
          )}
          <div className="field">
            <label className="lbl" htmlFor="l-email">
              Email
            </label>
            <input
              id="l-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="l-pass">
              Password
            </label>
            <input
              id="l-pass"
              className="input"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          {mode === "login" && twoFactorRequired && (
            <div className="field">
              <label className="lbl" htmlFor="l-totp">Authenticator code (staff only when 2FA is enabled)</label>
              <input id="l-totp" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" />
            </div>
          )}
          {err && (
            <p className="f-err" role="alert">
              {err}
            </p>
          )}
          {verificationNotice && (
            <div className="free-note" style={{ marginBottom: 14 }} role="status">
              <strong>Verify your email first.</strong> Check {verificationNotice} for the FikarNot verification link.
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={resending} onClick={async () => {
                  setResending(true);
                  try {
                    const response = await (await import("../api/authApi")).authApi.resendVerification(verificationNotice);
                    setDevVerificationUrl(response.devVerificationUrl || "");
                    appActions.toast("A new verification link has been prepared");
                  } catch (error) {
                    appActions.toast(error.message || "Could not resend verification", "err");
                  } finally { setResending(false); }
                }}>
                  {resending ? "Sending…" : "Resend verification"}
                </button>
                {devVerificationUrl && <a className="btn btn-ghost btn-sm" href={devVerificationUrl}>Open verification link</a>}
              </div>
            </div>
          )}
          {mode === "login" && (
            <div style={{ textAlign: "right", margin: "-4px 0 12px" }}>
              <Link to="/forgot-password" style={{ fontSize: 13, fontWeight: 600 }}>
                Forgot password?
              </Link>
            </div>
          )}
          <button className="btn btn-dark auth-submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"} <Ic n="arrow" s={15} />
          </button>
        </form>

        {mode === "login" && demo.length > 0 && (
          <div className="demo-login">
            <p className="lbl">Demo accounts</p>
            <div className="demo-actions">
              {demo.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEmail(d.e);
                    setPass(d.p);
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="auth-footnote">
          <Link to="/products">
            Continue browsing without an account <Ic n="arrow" s={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
