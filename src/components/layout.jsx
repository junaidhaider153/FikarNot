import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { useDebounced } from "../hooks/useDebounced";
import { fmt } from "../utils/helpers";
import { relevance } from "../utils/search";
import { Ic } from "./icons";

export function HeaderSearch() {
  const s = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const suggestions = useMemo(
    () =>
      dq.trim()
        ? s.products
            .map((p) => ({ p, score: relevance(p, dq) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
        : [],
    [dq, s.products],
  );
  useEffect(() => {
    setOpen(dq.trim() !== "" && suggestions.length > 0);
    setActive(-1);
  }, [suggestions, dq]);
  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const pick = (p) => {
    navigate(`/product/${p.id}`);
    setQ("");
    setOpen(false);
  };
  const goAll = () => {
    navigate(`/products?q=${encodeURIComponent(q.trim())}`);
    setQ("");
    setOpen(false);
  };
  const onKey = (e) => {
    if (!open) return;
    const total = suggestions.length + 1; // +1 for "see all results"
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % total);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + total) % total);
    } else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && active < suggestions.length) pick(suggestions[active].p);
      else goAll();
    }
  };
  return (
    <div className="searchbox" ref={boxRef}>
      <form
        className="search-input"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          goAll();
        }}
      >
        <Ic n="search" s={14} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => dq.trim() && setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search products…"
          aria-label="Search products"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="hdr-suggest"
        />
      </form>
      {open && (
        <ul className="suggest" id="hdr-suggest" role="listbox" aria-label="Search suggestions">
          {suggestions.map(({ p }, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "on" : ""}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
            >
              <img src={p.image} alt="" />
              <span className="nm">{p.name}</span>
              <span className="pr">{fmt(p.price)}</span>
            </li>
          ))}
          <li
            className={"sg-foot" + (active === suggestions.length ? " on" : "")}
            role="option"
            aria-selected={active === suggestions.length}
            onMouseEnter={() => setActive(suggestions.length)}
            onMouseDown={(e) => {
              e.preventDefault();
              goAll();
            }}
          >
            See all results for “{dq.trim()}” →
          </li>
        </ul>
      )}
    </div>
  );
}
function parseNavLinks(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((link) => link && link.label && link.url) : [];
  } catch {
    return [];
  }
}

export function Logo({ className = "logo", dark = false }) {
  const s = useApp();
  const logoUrl = s.siteSettings?.logoUrl;
  const storeName = s.siteSettings?.storeName || "FikarNot";
  return (
    <Link className={className} to="/" style={dark ? { color: "#fff" } : undefined}>
      {logoUrl ? (
        <img className="logo-image" src={logoUrl} alt={storeName} />
      ) : (
        <span className="logo-mark">{storeName.charAt(0).toUpperCase() || "F"}</span>
      )}
      {storeName}
    </Link>
  );
}

export function Header() {
  const s = useApp();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const count = s.cart.reduce((n, i) => n + i.qty, 0);
  const canEdit = s.session && ["admin", "editor"].includes(s.session.role);
  const customLinks = useMemo(() => parseNavLinks(s.siteSettings?.navLinks), [s.siteSettings?.navLinks]);
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <header className="hdr">
      <div className="container hdr-inner">
        <Logo />
        <nav className="nav" aria-label="Primary">
          <NavLink className="hdr-link" to="/">
            Home
          </NavLink>
          <NavLink className="hdr-link" to="/products">
            Shop
          </NavLink>
          {customLinks.map((link) => (
            <NavLink className="hdr-link" to={link.url} key={link.url}>
              {link.label}
            </NavLink>
          ))}
          {canEdit && (
            <NavLink className="hdr-link" to="/admin">
              Studio
            </NavLink>
          )}
        </nav>
        <div className="hdr-actions">
          <HeaderSearch />
          {s.session ? (
            <span className="user-chip">
              <Link className="user-link" to="/account" aria-label="Open your account">
                <span className="avatar">
                  {s.session.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <span className="uname">{s.session.name.split(" ")[0]}</span>
              </Link>
              <button
                className="icon-btn dark"
                onClick={() => {
                  appActions.logout();
                }}
                aria-label="Sign out"
                title="Sign out"
              >
                <Ic n="logout" s={15} />
              </button>
            </span>
          ) : (
            <NavLink className="hdr-link signin-header" to="/login">
              <Ic n="user" s={15} /> Sign in
            </NavLink>
          )}
          {s.session && (
            <Link
              className="icon-link dark notification-header"
              to="/notifications"
              aria-label={`Notifications, ${s.notifications?.filter((item) => !item.read).length || 0} unread`}
              title="Notifications"
            >
              <Ic n="bell" s={17} />
              {(s.notifications?.filter((item) => !item.read).length || 0) > 0 && (
                <span className="count-badge">{s.notifications.filter((item) => !item.read).length}</span>
              )}
            </Link>
          )}
          <Link
            className="icon-link dark wishlist-header"
            to="/wishlist"
            aria-label={`Wishlist, ${s.wishlist.length} items`}
            title="Wishlist"
          >
            <Ic n="heart" s={17} filled={s.wishlist.length > 0} />
            {s.wishlist.length > 0 && <span className="count-badge">{s.wishlist.length}</span>}
          </Link>
          <Link className="icon-link dark recently-viewed-header" to="/recently-viewed" aria-label="Recently viewed products" title="Recently viewed">
            <Ic n="clock" s={17} />
          </Link>
          <Link className="cart-btn" to="/cart" aria-label={`Cart, ${count} items`}>
            <Ic n="cart" s={17} />
            {count > 0 && <span className="count-badge">{count}</span>}
          </Link>
          <button className="icon-btn dark menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Ic n={open ? "x" : "menu"} s={18} />
          </button>
        </div>
      </div>
      <nav className={"mobile-nav" + (open ? " open" : "")} aria-label="Mobile">
        <NavLink to="/">Home</NavLink>
        <NavLink to="/products">Shop</NavLink>
        {customLinks.map((link) => (
          <NavLink to={link.url} key={link.url}>
            {link.label}
          </NavLink>
        ))}
        {canEdit && <NavLink to="/admin">Studio</NavLink>}
        <NavLink to="/compare">Compare ({s.comparison.length})</NavLink>
        <NavLink to="/wishlist">Wishlist ({s.wishlist.length})</NavLink>
        <NavLink to="/recently-viewed">Recently viewed</NavLink>
        {s.session && (
          <NavLink to="/notifications">
            Notifications
            {(s.notifications?.filter((item) => !item.read).length || 0) > 0
              ? ` (${s.notifications.filter((item) => !item.read).length})`
              : ""}
          </NavLink>
        )}
        <NavLink to="/cart">Cart ({count})</NavLink>
        {s.session ? <NavLink to="/account">My account</NavLink> : <NavLink to="/login">Sign in</NavLink>}
      </nav>
    </header>
  );
}
const DEFAULT_MARQUEE_ITEMS = ["Free shipping over $75", "30-day returns", "Designed in Portland", "Carbon-neutral delivery", "2-year warranty"];

export function Marquee() {
  const s = useApp();
  const announcement = s.siteSettings?.announcement?.trim();
  // Store owners can enter one line, or split several lines/segments with
  // a newline, a pipe ( | ) or a middle dot ( · ) to get the classic
  // multi-item scrolling marquee instead of a single repeated message.
  const items = announcement ? announcement.split(/\r?\n|\s*\|\s*|\s+·\s+/).map((t) => t.trim()).filter(Boolean) : DEFAULT_MARQUEE_ITEMS;
  const row = items.map((t, i) => <span key={`${t}-${i}`}>{t} ✦</span>);
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {row}
        {row}
      </div>
    </div>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo dark />
            <p style={{ marginTop: 14, fontSize: 13.5, maxWidth: "34ch" }}>
              Everyday objects, obsessively made. A demo storefront that runs entirely in your browser — no server, no database.
            </p>
          </div>
          <div>
            <h4>Shop</h4>
            <Link to="/products">All products</Link>
            <Link to="/products?cat=c1">Audio</Link>
            <Link to="/products?cat=c2">Wearables</Link>
            <Link to="/products?cat=c3">Home &amp; Desk</Link>
            <Link to="/products?cat=c4">Carry</Link>
          </div>
          <div>
            <h4>Account</h4>
            <Link to="/login">Sign in</Link>
            <Link to="/account">My account</Link>
            <Link to="/wishlist">Wishlist</Link>
            <Link to="/cart">Cart</Link>
            <Link to="/checkout">Checkout</Link>
            <Link to="/admin">Studio</Link>
          </div>
          <div>
            <h4>Help</h4>
            <Link to="/help">Help Center</Link>
            <Link to="/shipping">Shipping</Link>
            <Link to="/returns">Returns</Link>
            <Link to="/about">About</Link>
            <Link to="/privacy">Privacy</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} FikarNot Demo Store — no real orders.</span>
          <button className="reset" onClick={appActions.resetDemo}>
            <Ic n="refresh" s={12} /> Reset demo data
          </button>
        </div>
      </div>
    </footer>
  );
}
export function Toast() {
  const s = useApp();
  if (!s.toast) return null;
  return (
    <div className={"toast" + (s.toast.kind === "err" ? " err" : "")} role="status" aria-live="polite">
      <span className="dot" />
      {s.toast.msg}
    </div>
  );
}

/* ============================ product pieces ============================= */
