import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../api/authApi";
import { supabase } from "../lib/supabaseClient";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { Ic } from "../components/icons";

export default function VerifyEmailPage() {
  useDocumentMeta({ title: "Verify email", noindex: true });
  // Supabase's confirmation link signs the visitor in directly and already
  // marks their email as confirmed server-side — there's no separate manual
  // "verify" step like the old server needed. This page just waits for that
  // session to appear, then sends them on their way.
  const [state, setState] = useState({ loading: true, valid: false, error: "" });

  useEffect(() => {
    let alive = true;

    const finish = async () => {
      try {
        const result = await authApi.me();
        if (!alive) return;
        if (result.authenticated) {
          window.location.assign(result.user?.role === "admin" || result.user?.role === "editor" ? "/admin" : "/account");
        } else {
          setState({ loading: false, valid: false, error: "This verification link is invalid or has already been used." });
        }
      } catch (error) {
        if (alive) setState({ loading: false, valid: false, error: error.message || "Verification link unavailable." });
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (alive && session && (event === "SIGNED_IN" || event === "USER_UPDATED")) finish();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (alive && data?.session) finish();
      else if (alive) setState({ loading: false, valid: false, error: "This verification link is invalid or has already been used." });
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state.loading) return <div className="container" style={{ padding: "60px 24px" }}><div className="panel">Checking your verification link…</div></div>;

  return (
    <div className="container auth-wrap">
      <div className="panel auth-panel">
        <div className="auth-intro"><span className="step-n"><Ic n="check" s={14} /></span><div><p className="eyebrow">Email verification</p><h1 className="auth-title display">Verify your email</h1><p className="auth-sub">Confirm your email address to finish setting up your FikarNot account.</p></div></div>
        <div className="error-card" role="alert"><span className="empty-ic"><Ic n="alert" s={26} /></span><h3 className="display">Verification link unavailable</h3><p style={{ color: "var(--ink2)", margin: "6px 0 18px" }}>{state.error}</p><Link className="btn btn-dark" to="/login">Back to sign in</Link></div>
      </div>
    </div>
  );
}
