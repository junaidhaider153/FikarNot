import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { useDebounced } from "../hooks/useDebounced";
import { fmt } from "../utils/helpers";
import { Ic } from "./icons";

export function relevance(p, q) {
  const t = q.toLowerCase().trim();
  if (!t) return 0;
  let score = 0;
  const name = p.name.toLowerCase(), desc = p.description.toLowerCase(), tags = p.tags.join(" ").toLowerCase();
  if (name === t) score += 100;
  if (name.startsWith(t)) score += 60;
  if (name.includes(t)) score += 40;
  if (tags.includes(t)) score += 25;
  if (desc.includes(t)) score += 10;
  return score;
}
export function HeaderSearch() {
  const s = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const suggestions = useMemo(
    () => (dq.trim() ? s.products.map((p) => ({ p, score: relevance(p, dq) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5) : []),
    [dq, s.products]
  );
  useEffect(() => { setOpen(dq.trim() !== "" && suggestions.length > 0); setActive(-1); }, [suggestions, dq]);
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const pick = (p) => { navigate(`/product/${p.id}`); setQ(""); setOpen(false); };
  const goAll = () => { navigate(`/products?q=${encodeURIComponent(q.trim())}`); setQ(""); setOpen(false); };
  const onKey = (e) => {
    if (!open) return;
    const total = suggestions.length + 1; // +1 for "see all results"
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % total); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + total) % total); }
    else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && active < suggestions.length) pick(suggestions[active].p);
      else goAll();
    }
  };
  return (
    <div className="searchbox" ref={boxRef}>
      <form className="search-input" role="search" onSubmit={(e) => { e.preventDefault(); goAll(); }}>
        <Ic n="search" s={14} />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => dq.trim() && setOpen(true)}
          onKeyDown={onKey} placeholder="Search products…" aria-label="Search products"
          role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls="hdr-suggest"
        />
      </form>
      {open && (
        <ul className="suggest" id="hdr-suggest" role="listbox" aria-label="Search suggestions">
          {suggestions.map(({ p }, i) => (
            <li key={p.id} role="option" aria-selected={i === active} className={i === active ? "on" : ""}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
              <img src={p.image} alt="" /><span className="nm">{p.name}</span><span className="pr">{fmt(p.price)}</span>
            </li>
          ))}
          <li className={"sg-foot" + (active === suggestions.length ? " on" : "")} role="option" aria-selected={active === suggestions.length}
            onMouseEnter={() => setActive(suggestions.length)} onMouseDown={(e) => { e.preventDefault(); goAll(); }}>
            See all results for “{dq.trim()}” →
          </li>
        </ul>
      )}
    </div>
  );
}
export function Header() {
  const s = useApp();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const count = s.cart.reduce((n, i) => n + i.qty, 0);
  const canEdit = s.session && ["admin", "editor"].includes(s.session.role);
  useEffect(() => setOpen(false), [location.path]);
  return (
    <header className="hdr">
      <div className="container hdr-inner">
        <Link className="logo" to="/"><span className="logo-mark">F</span>FikarNot</Link>
        <nav className="nav" aria-label="Primary">
          <NavLink className="hdr-link" to="/">Home</NavLink>
          <NavLink className="hdr-link" to="/products">Shop</NavLink>
          {canEdit && <NavLink className="hdr-link" to="/admin">Studio</NavLink>}
        </nav>
        <div className="hdr-actions">
          <HeaderSearch />
          {s.session ? (
            <span className="user-chip">
              <span className="avatar">{s.session.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
              <span className="uname">{s.session.name.split(" ")[0]}</span>
              <button className="icon-btn dark" onClick={() => { appActions.logout(); }} aria-label="Sign out" title="Sign out"><Ic n="logout" s={15} /></button>
            </span>
          ) : (
            <NavLink className="hdr-link" to="/login"><Ic n="user" s={15} /> Sign in</NavLink>
          )}
          <Link className="cart-btn" to="/cart" aria-label={`Cart, ${count} items`}>
            <Ic n="cart" s={17} />{count > 0 && <span className="count-badge">{count}</span>}
          </Link>
          <button className="icon-btn dark menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}><Ic n={open ? "x" : "menu"} s={18} /></button>
        </div>
      </div>
      <nav className={"mobile-nav" + (open ? " open" : "")} aria-label="Mobile">
        <NavLink to="/">Home</NavLink>
        <NavLink to="/products">Shop</NavLink>
        {canEdit && <NavLink to="/admin">Studio</NavLink>}
        <NavLink to="/cart">Cart ({count})</NavLink>
        {!s.session && <NavLink to="/login">Sign in</NavLink>}
      </nav>
    </header>
  );
}
export function Marquee() {
  const items = ["Free shipping over $75", "30-day returns", "Designed in Portland", "Carbon-neutral delivery", "2-year warranty"];
  const row = items.map((t) => <span key={t}>{t} ✦</span>);
  return <div className="marquee" aria-hidden="true"><div className="marquee-track">{row}{row}</div></div>;
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link className="logo" to="/" style={{ color: "#fff" }}><span className="logo-mark">F</span>FikarNot</Link>
            <p style={{ marginTop: 14, fontSize: 13.5, maxWidth: "34ch" }}>Everyday objects, obsessively made. A demo storefront that runs entirely in your browser — no server, no database.</p>
          </div>
          <div><h4>Shop</h4><Link to="/products">All products</Link><Link to="/products?cat=c1">Audio</Link><Link to="/products?cat=c2">Wearables</Link><Link to="/products?cat=c3">Home &amp; Desk</Link><Link to="/products?cat=c4">Carry</Link></div>
          <div><h4>Account</h4><Link to="/login">Sign in</Link><Link to="/cart">Cart</Link><Link to="/checkout">Checkout</Link><Link to="/admin">Studio</Link></div>
          <div><h4>Help</h4><Link to="/products">FAQ</Link><Link to="/products">Shipping</Link><Link to="/products">Returns</Link></div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} FikarNot Demo Store — no real orders.</span>
          <button className="reset" onClick={appActions.resetDemo}><Ic n="refresh" s={12} /> Reset demo data</button>
        </div>
      </div>
    </footer>
  );
}
export function Toast() {
  const s = useApp();
  if (!s.toast) return null;
  return <div className={"toast" + (s.toast.kind === "err" ? " err" : "")} role="status" aria-live="polite"><span className="dot" />{s.toast.msg}</div>;
}

/* ============================ product pieces ============================= */
