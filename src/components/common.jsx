import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Ic } from "./icons";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Stars({ v, size = 13 }) {
  return (
    <span className="stars" aria-label={`Rated ${v} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ic key={i} n="star" s={size} filled className={i <= Math.round(v) ? "" : "dim"} />
      ))}
    </span>
  );
}
export function Modal({ title, onClose, children, wide = false }) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const first = dialogRef.current?.querySelector(FOCUSABLE_SELECTOR);
    (first || dialogRef.current)?.focus();
    return () => {
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- backdrop click-to-dismiss is a mouse-only convenience layered on top of the Escape key handling and focus trap above, both fully keyboard-accessible.
    <div
      className="modal-bk"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={"modal" + (wide ? " modal-wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="modal-hd">
          <h3 className="display">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <Ic n="x" />
          </button>
        </div>
        <div className="modal-bd">{children}</div>
      </div>
    </div>
  );
}
export function Empty({ icon = "box", title, sub, cta }) {
  return (
    <div className="empty">
      <span className="empty-ic">
        <Ic n={icon} s={26} />
      </span>
      <h3 className="display">{title}</h3>
      {sub && <p>{sub}</p>}
      {cta}
    </div>
  );
}
export function ErrorCard({ message, onRetry }) {
  return (
    <div className="error-card">
      <span className="empty-ic">
        <Ic n="alert" s={26} />
      </span>
      <h3 className="display">Something went wrong</h3>
      <p style={{ color: "var(--ink2)", margin: "6px 0 18px" }}>{message}</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {onRetry && (
          <button className="btn btn-dark" onClick={onRetry}>
            <Ic n="refresh" s={15} /> Try again
          </button>
        )}
        <Link className="btn btn-ghost" to="/products">
          Back to shop
        </Link>
      </div>
    </div>
  );
}
export function Qty({ value, set, max = 99 }) {
  return (
    <div className="qty" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <button
        className="icon-btn"
        style={{ width: 32, height: 32 }}
        aria-label="Decrease quantity"
        onClick={() => set(Math.max(1, value - 1))}
      >
        <Ic n="minus" s={14} />
      </button>
      <span style={{ minWidth: 32, textAlign: "center", fontWeight: 700 }} aria-live="polite">
        {value}
      </span>
      <button
        className="icon-btn"
        style={{ width: 32, height: 32 }}
        aria-label="Increase quantity"
        onClick={() => set(Math.min(max, value + 1))}
      >
        <Ic n="plus" s={14} />
      </button>
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
export function Pagination({ page, pageCount, setPage, start, end, total, noun = "items" }) {
  if (pageCount <= 1) return null;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-count">
        {start}–{end} of {total} {noun}
      </span>
      <div className="pagination-controls">
        <button type="button" className="icon-btn" aria-label="Previous page" disabled={page === 1} onClick={() => setPage(page - 1)}>
          <Ic n="arrow" s={14} style={{ transform: "rotate(180deg)" }} />
        </button>
        {pages.map((p, i) => (
          <span key={p} style={{ display: "contents" }}>
            {i > 0 && pages[i - 1] !== p - 1 && <span className="pagination-ellipsis">…</span>}
            <button
              type="button"
              className={"pagination-page" + (p === page ? " on" : "")}
              aria-current={p === page ? "page" : undefined}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          </span>
        ))}
        <button type="button" className="icon-btn" aria-label="Next page" disabled={page === pageCount} onClick={() => setPage(page + 1)}>
          <Ic n="arrow" s={14} />
        </button>
      </div>
    </nav>
  );
}

export function ForbiddenView() {
  return (
    <div className="container" style={{ padding: "60px 24px" }}>
      <Empty
        icon="shield"
        title="Staff only"
        sub="Your account doesn't have permission to view this page. Ask an admin to upgrade your role."
        cta={
          <Link className="btn btn-dark" to="/">
            Back home
          </Link>
        }
      />
    </div>
  );
}

/* ============================ layout: header/footer ======================= */
