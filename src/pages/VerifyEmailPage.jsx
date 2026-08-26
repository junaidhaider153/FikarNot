import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../api/authApi";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { Ic } from "../components/icons";

export default function VerifyEmailPage() {
  useDocumentMeta({ title: "Verify email", noindex: true });
  const [query] = useSearchParams();
  const token = useMemo(() => query.get("token") || "", [query]);
  const [state, setState] = useState({ loading: true, valid: false, error: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!token) { setState({ loading: false, valid: false, error: "This verification link is missing its token." }); return undefined; }
    authApi.verifyEmail(token).then(() => { if (alive) setState({ loading: false, valid: true, error: "" }); }).catch((error) => { if (alive) setState({ loading: false, valid: false, error: error.message || "Verification link unavailable." }); });
    return () => { alive = false; };
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await authApi.confirmEmail(token);
      window.location.assign(result.user?.role === "admin" || result.user?.role === "editor" ? "/admin" : "/account");
    } catch (error) {
      setState((current) => ({ ...current, error: error.message || "Could not verify your email." }));
      setBusy(false);
    }
  };

  if (state.loading) return <div className="container" style={{ padding: "60px 24px" }}><div className="panel">Checking your verification link…</div></div>;

  return (
    <div className="container auth-wrap">
      <div className="panel auth-panel">
        <div className="auth-intro"><span className="step-n"><Ic n="check" s={14} /></span><div><p className="eyebrow">Email verification</p><h1 className="auth-title display">Verify your email</h1><p className="auth-sub">Confirm your email address to finish setting up your FikarNot account.</p></div></div>
        {state.valid && !state.error ? (
          <div style={{ textAlign: "center" }}><div className="success-ic"><Ic n="check" s={28} /></div><h2 className="display">You&apos;re almost there</h2><p style={{ color: "var(--ink2)", margin: "8px 0 18px" }}>Your verification link is valid. Continue to activate your account.</p><button className="btn btn-dark" disabled={busy} onClick={confirm}>{busy ? "Verifying…" : "Verify email"} <Ic n="check" s={15} /></button></div>
        ) : (
          <div className="error-card" role="alert"><span className="empty-ic"><Ic n="alert" s={26} /></span><h3 className="display">Verification link unavailable</h3><p style={{ color: "var(--ink2)", margin: "6px 0 18px" }}>{state.error}</p><Link className="btn btn-dark" to="/login">Back to sign in</Link></div>
        )}
      </div>
    </div>
  );
}
