import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { Ic } from "../components/icons";

export default function LoginPage() {
  const s = useApp();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const redirect = query.get("redirect");
  const submittedRef = useRef(false);

  useEffect(() => {
    if (s.session && !submittedRef.current) navigate(redirect || "/account", { replace: true });
  }, [s.session, redirect, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) { setErr("Please enter a valid email address"); return; }
    if (!pass) { setErr("Please enter your password"); return; }
    if (mode === "register" && name.trim().length < 2) { setErr("Please enter your name"); return; }
    if (mode === "register" && pass.length < 6) { setErr("Password must be at least 6 characters"); return; }
    setBusy(true);
    submittedRef.current = true;
    const user = mode === "login" ? await appActions.login(cleanEmail, pass) : await appActions.register(name, cleanEmail, pass);
    setBusy(false);
    if (user) navigate(redirect || (user.role === "admin" || user.role === "editor" ? "/admin" : "/account"), { replace: true });
  };

  const demo = [
    { label: "Admin", e: "admin@kiosk.shop", p: "admin123" },
    { label: "Editor", e: "editor@kiosk.shop", p: "editor123" },
    { label: "Customer", e: "maya@kiosk.shop", p: "maya123" },
  ];

  return (
    <div className="container auth-wrap">
      <div className="panel auth-panel">
        <div className="auth-intro">
          <span className="step-n"><Ic n="user" s={14} /></span>
          <div>
            <p className="eyebrow">FikarNot account</p>
            <h1 className="auth-title display">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="auth-sub">{mode === "login" ? "Sign in to view your orders and manage your account." : "Create an account to keep your details and orders in one place."}</p>
          </div>
        </div>

        <div className="auth-tabs" role="tablist">
          <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setErr(""); }}>Sign in</button>
          <button role="tab" aria-selected={mode === "register"} className={mode === "register" ? "on" : ""} onClick={() => { setMode("register"); setErr(""); }}>Register</button>
        </div>

        {redirect && <div className="free-note" style={{ background: "#F1EDE2", color: "var(--ink2)" }}>Sign in to continue to <b>{redirect}</b></div>}

        <form onSubmit={submit} noValidate>
          {mode === "register" && <div className="field"><label className="lbl" htmlFor="r-name">Name</label><input id="r-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" /></div>}
          <div className="field"><label className="lbl" htmlFor="l-email">Email</label><input id="l-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></div>
          <div className="field"><label className="lbl" htmlFor="l-pass">Password</label><input id="l-pass" className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>
          {err && <p className="f-err" role="alert">{err}</p>}
          <button className="btn btn-dark auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"} <Ic n="arrow" s={15} /></button>
        </form>

        {mode === "login" && (
          <div className="demo-login">
            <p className="lbl">Demo accounts</p>
            <div className="demo-actions">
              {demo.map((d) => <button key={d.label} type="button" className="btn btn-ghost btn-sm" onClick={() => { setEmail(d.e); setPass(d.p); }}>{d.label}</button>)}
            </div>
          </div>
        )}

        <div className="auth-footnote">
          <Link to="/products">Continue browsing without an account <Ic n="arrow" s={13} /></Link>
        </div>
      </div>
    </div>
  );
}
