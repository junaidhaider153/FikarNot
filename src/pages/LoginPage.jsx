import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  useEffect(() => { if (s.session) navigate(redirect || "/"); }, [s.session]); // eslint-disable-line
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    if (mode === "register" && name.trim().length < 2) { setErr("Please enter your name"); setBusy(false); return; }
    if (mode === "register" && pass.length < 6) { setErr("Password must be at least 6 characters"); setBusy(false); return; }
    const u = mode === "login" ? await appActions.login(email, pass) : await appActions.register(name, email, pass);
    setBusy(false);
    if (u) navigate(redirect || (["admin", "editor"].includes(u.role) ? "/admin" : "/"));
  };
  const demo = [
    { label: "Admin", e: "admin@kiosk.shop", p: "admin123" },
    { label: "Editor", e: "editor@kiosk.shop", p: "editor123" },
    { label: "Customer", e: "maya@kiosk.shop", p: "maya123" },
  ];
  return (
    <div className="container auth-wrap">
      <div className="panel">
        <h3><span className="step-n">K</span> {mode === "login" ? "Sign in" : "Create account"}</h3>
        <div className="auth-tabs" role="tablist">
          <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setErr(""); }}>Sign in</button>
          <button role="tab" aria-selected={mode === "register"} className={mode === "register" ? "on" : ""} onClick={() => { setMode("register"); setErr(""); }}>Register</button>
        </div>
        {redirect && <div className="free-note" style={{ background: "#F1EDE2", color: "var(--ink2)" }}>Sign in to continue to <b>{redirect}</b></div>}
        <form onSubmit={submit}>
          {mode === "register" && <div style={{ marginBottom: 12 }}><label className="lbl" htmlFor="r-name">Name</label><input id="r-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>}
          <div style={{ marginBottom: 12 }}><label className="lbl" htmlFor="l-email">Email</label><input id="l-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@kiosk.shop" autoComplete="email" /></div>
          <div style={{ marginBottom: 16 }}><label className="lbl" htmlFor="l-pass">Password</label><input id="l-pass" className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>
          {err && <p className="f-err" role="alert" style={{ marginBottom: 12 }}>{err}</p>}
          <button className="btn btn-dark" style={{ width: "100%" }} disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        {mode === "login" && <>
          <p className="lbl" style={{ margin: "18px 0 0" }}>Demo accounts</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {demo.map((d) => <button key={d.label} type="button" className="btn btn-ghost btn-sm" onClick={() => { setEmail(d.e); setPass(d.p); }}>{d.label}</button>)}
          </div>
        </>}
      </div>
    </div>
  );
}

/* ============================ admin studio ================================ */
