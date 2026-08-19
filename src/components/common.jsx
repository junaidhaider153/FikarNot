import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Ic } from "./icons";

export function Stars({ v, size = 13 }) {
  return (
    <span className="stars" aria-label={`Rated ${v} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Ic key={i} n="star" s={size} filled className={i <= Math.round(v) ? "" : "dim"} />)}
    </span>
  );
}
export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => { const fn = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", fn); return () => window.removeEventListener("keydown", fn); }, [onClose]);
  return (
    <div className="modal-bk" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"modal" + (wide ? " modal-wide" : "")} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-hd">
          <h3 className="display">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog"><Ic n="x" /></button>
        </div>
        <div className="modal-bd">{children}</div>
      </div>
    </div>
  );
}
export function Empty({ icon = "box", title, sub, cta }) {
  return (
    <div className="empty">
      <span className="empty-ic"><Ic n={icon} s={26} /></span>
      <h3 className="display">{title}</h3>
      {sub && <p>{sub}</p>}
      {cta}
    </div>
  );
}
export function ErrorCard({ message, onRetry }) {
  return (
    <div className="error-card">
      <span className="empty-ic"><Ic n="alert" s={26} /></span>
      <h3 className="display">Something went wrong</h3>
      <p style={{ color: "var(--ink2)", margin: "6px 0 18px" }}>{message}</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {onRetry && <button className="btn btn-dark" onClick={onRetry}><Ic n="refresh" s={15} /> Try again</button>}
        <Link className="btn btn-ghost" to="/products">Back to shop</Link>
      </div>
    </div>
  );
}
export function Qty({ value, set, max = 99 }) {
  return (
    <div className="qty" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Decrease quantity" onClick={() => set(Math.max(1, value - 1))}><Ic n="minus" s={14} /></button>
      <span style={{ minWidth: 32, textAlign: "center", fontWeight: 700 }} aria-live="polite">{value}</span>
      <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Increase quantity" onClick={() => set(Math.min(max, value + 1))}><Ic n="plus" s={14} /></button>
    </div>
  );
}
export function SkelGrid({ n = 4 }) {
  return (
    <div className="prod-grid" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div className="sk-card" key={i}>
          <div className="skeleton sk-img" />
          <div className="skeleton sk-line" style={{ width: "70%" }} />
          <div className="skeleton sk-line" style={{ width: "45%" }} />
          <div className="skeleton sk-line" style={{ width: "30%", marginBottom: 16 }} />
        </div>
      ))}
    </div>
  );
}
export function SkelDetail() {
  return (
    <div className="detail" aria-hidden="true">
      <div className="skeleton" style={{ aspectRatio: "1/1", borderRadius: 20 }} />
      <div>
        <div className="skeleton" style={{ height: 14, width: "40%", marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 34, width: "75%", marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 14, width: "55%", marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 14, width: "90%", marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 14, width: "70%", marginBottom: 26 }} />
        <div className="skeleton" style={{ height: 46, width: 220, borderRadius: 12 }} />
      </div>
    </div>
  );
}
export function ForbiddenView() {
  return (
    <div className="container" style={{ padding: "60px 24px" }}>
      <Empty icon="shield" title="Staff only" sub="Your account doesn't have permission to view this page. Ask an admin to upgrade your role." cta={<Link className="btn btn-dark" to="/">Back home</Link>} />
    </div>
  );
}

/* ============================ layout: header/footer ======================= */
