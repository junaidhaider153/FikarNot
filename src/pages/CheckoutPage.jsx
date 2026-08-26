import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp, appActions, cartLines } from "../store/appStore";
import { fmt, delay } from "../utils/helpers";
import { Ic } from "../components/icons";
import { Empty } from "../components/common";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

const MOCK_CARD_ENABLED = import.meta.env.VITE_ENABLE_MOCK_PAYMENTS === "1" || import.meta.env.DEV;

const INITIAL_FORM = {
  name: "",
  email: "",
  address: "",
  city: "",
  zip: "",
  card: "",
  exp: "",
  cvc: "",
};

export default function CheckoutPage() {
  const s = useApp();
  useDocumentMeta({ title: "Checkout", noindex: true });
  const lines = cartLines(s);
  const [guestUnlocked, setGuestUnlocked] = useState(Boolean(s.session));
  const [guestEmail, setGuestEmail] = useState("");
  const [guestEmailError, setGuestEmailError] = useState("");
  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM,
    name: s.session?.name || "",
    email: s.session?.email || "",
  }));
  const [paymentMethod, setPaymentMethod] = useState(MOCK_CARD_ENABLED ? "card" : "cod");
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");

  const totals = useMemo(() => {
    const subtotal = +lines.reduce((total, line) => total + line.p.price * line.qty, 0).toFixed(2);
    const baseShipping = subtotal === 0 ? 0 : subtotal >= 75 ? 0 : 6.95;
    if (!appliedCoupon)
      return { subtotal, shipping: baseShipping, discount: 0, total: +(subtotal + baseShipping).toFixed(2), couponInvalidReason: "" };
    const result = appActions.validateCoupon(appliedCoupon.code, subtotal, baseShipping);
    if (result.error)
      return {
        subtotal,
        shipping: baseShipping,
        discount: 0,
        total: +(subtotal + baseShipping).toFixed(2),
        couponInvalidReason: result.error,
      };
    const shipping = result.shippingFree ? 0 : baseShipping;
    return {
      subtotal,
      shipping,
      discount: result.discount || 0,
      total: +(subtotal - (result.discount || 0) + shipping).toFixed(2),
      couponInvalidReason: "",
    };
  }, [lines, appliedCoupon]);

  // If the cart changes underneath an already-applied coupon (item removed, quantity
  // reduced) and it no longer qualifies, surface that instead of letting the "applied"
  // badge silently keep showing while the discount quietly reverts to $0.
  useEffect(() => {
    if (appliedCoupon && totals.couponInvalidReason) {
      setCouponError(
        `${appliedCoupon.code} no longer applies: ${totals.couponInvalidReason.charAt(0).toLowerCase()}${totals.couponInvalidReason.slice(1)}`,
      );
      setAppliedCoupon(null);
      setCouponCode("");
    }
  }, [totals.couponInvalidReason, appliedCoupon]);

  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    if (errs[key]) setErrs((current) => ({ ...current, [key]: "" }));
  };

  const applyCoupon = (event) => {
    event.preventDefault();
    const code = couponCode.trim();
    const baseShipping = totals.subtotal === 0 ? 0 : totals.subtotal >= 75 ? 0 : 6.95;
    const result = appActions.validateCoupon(code, totals.subtotal, baseShipping);
    if (result.error) {
      setCouponError(result.error);
      setAppliedCoupon(null);
      return;
    }
    setCouponError("");
    setAppliedCoupon(result.coupon);
    setCouponCode(result.coupon.code);
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponError("");
    setCouponCode("");
  };

  const continueAsGuest = (event) => {
    event.preventDefault();
    const email = guestEmail.trim();
    if (!/.+@.+\..+/.test(email)) {
      setGuestEmailError("Enter a valid email so we can send your order confirmation.");
      return;
    }
    setGuestEmailError("");
    setForm((current) => ({ ...current, email }));
    setGuestUnlocked(true);
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = "Full name is required";
    if (!/.+@.+\..+/.test(form.email.trim())) next.email = "Enter a valid email";
    if (!form.address.trim()) next.address = "Address is required";
    if (!form.city.trim()) next.city = "City is required";
    if (!form.zip.trim()) next.zip = "ZIP / postal code is required";

    if (paymentMethod === "card") {
      if (form.card.replace(/\D/g, "").length !== 16) next.card = "Enter a valid 16-digit card number";
      if (!/^\d{2}\/\d{2}$/.test(form.exp)) next.exp = "Use MM/YY";
      if (!/^\d{3}$/.test(form.cvc)) next.cvc = "Enter a 3-digit CVC";
    }

    return next;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy || !lines.length) return;

    const nextErrors = validate();
    setErrs(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    await delay(900);

    const order = await appActions.placeOrder(
      {
        name: form.name.trim(),
        email: form.email.trim(),
        address: `${form.address.trim()}, ${form.city.trim()} ${form.zip.trim()}`,
        paymentMethod,
      },
      appliedCoupon?.code || "",
    );

    setBusy(false);
    if (!order?.id) {
      appActions.toast("We couldn't create the order. Please try again.", "err");
      return;
    }
    setPlaced(order);
  };

  if (placed) return <OrderConfirmation order={placed} />;

  if (lines.length === 0) {
    return (
      <div className="container" style={{ padding: "60px 24px" }}>
        <Empty
          icon="cart"
          title="Nothing to check out"
          sub="Your shopping bag is empty. Add something you love first."
          cta={
            <Link className="btn btn-dark" to="/products">
              Go to shop
            </Link>
          }
        />
      </div>
    );
  }

  if (!s.session && !guestUnlocked) {
    return (
      <div className="container checkout-page">
        <div className="checkout-head">
          <div>
            <p className="eyebrow">Checkout</p>
            <h1 className="h1 checkout-title">One quick step first.</h1>
            <p className="hero-sub">Sign in for a faster checkout, or continue as a guest with your email address.</p>
          </div>
          <Link className="btn btn-ghost" to="/cart">
            <Ic n="arrow" s={15} /> Back to cart
          </Link>
        </div>

        <div className="checkout-grid">
          <section className="panel checkout-panel">
            <div className="checkout-access-card">
              <span className="step-n">
                <Ic n="mail" s={14} />
              </span>
              <div>
                <h3 className="display">Continue as guest</h3>
                <p>We need your email to send your order confirmation and keep you updated.</p>
              </div>
            </div>
            <form onSubmit={continueAsGuest} style={{ marginTop: 20 }}>
              <label className="lbl" htmlFor="guest-email">
                Email address
              </label>
              <input
                id="guest-email"
                className="input"
                type="email"
                value={guestEmail}
                onChange={(event) => {
                  setGuestEmail(event.target.value);
                  setGuestEmailError("");
                }}
                autoComplete="email"
                placeholder="you@example.com"
              />
              {guestEmailError && (
                <p className="f-err" role="alert">
                  {guestEmailError}
                </p>
              )}
              <button className="btn btn-lime" style={{ width: "100%", marginTop: 14 }} type="submit">
                Continue as guest <Ic n="arrow" s={15} />
              </button>
            </form>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0", color: "var(--ink2)", fontSize: 13 }}>
              <span style={{ height: 1, flex: 1, background: "var(--line)" }} />
              <span>or</span>
              <span style={{ height: 1, flex: 1, background: "var(--line)" }} />
            </div>
            <Link className="btn btn-dark" style={{ width: "100%" }} to={`/login?redirect=${encodeURIComponent("/checkout")}`}>
              Sign in to checkout <Ic n="arrow" s={15} />
            </Link>
          </section>

          <aside className="summary checkout-summary">
            <div className="checkout-summary-head">
              <div>
                <span className="eyebrow">Your bag</span>
                <h2 className="display">Order summary</h2>
              </div>
              <Link to="/cart">Edit</Link>
            </div>
            <div className="checkout-lines">
              {lines.map((line) => (
                <div className="checkout-line" key={line.p.id}>
                  <img src={line.p.images?.[0] || line.p.image} alt="" />
                  <div>
                    <strong>{line.p.name}</strong>
                    <span>Qty {line.qty}</span>
                  </div>
                  <b>{fmt(line.p.price * line.qty)}</b>
                </div>
              ))}
            </div>
            <div className="sum-row">
              <span>Subtotal</span>
              <span>{fmt(totals.subtotal)}</span>
            </div>
            <div className="sum-row">
              <span>Shipping</span>
              <span>{totals.shipping === 0 ? "Free" : fmt(totals.shipping)}</span>
            </div>
            <div className="sum-row total">
              <span>Total</span>
              <span>{fmt(totals.total)}</span>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  const paymentLabel = paymentMethod === "card" ? "Place demo card order" : "Place COD order";

  return (
    <div className="container checkout-page">
      <div className="checkout-head">
        <div>
          <p className="eyebrow">Secure checkout</p>
          <h1 className="h1 checkout-title">Finish your order.</h1>
          <p className="hero-sub">A simple, focused checkout with everything you need and nothing you don&apos;t.</p>
        </div>
        <Link className="btn btn-ghost" to="/cart">
          <Ic n="arrow" s={15} /> Back to cart
        </Link>
      </div>

      <div className="checkout-grid">
        <form onSubmit={submit} noValidate>
          <section className="panel checkout-panel">
            <h3>
              <span className="step-n">1</span> Contact &amp; shipping
            </h3>
            <div className="f-grid">
              <div>
                <label className="lbl" htmlFor="f-name">
                  Full name
                </label>
                <input id="f-name" className="input" value={form.name} onChange={set("name")} autoComplete="name" />
                {errs.name && <p className="f-err">{errs.name}</p>}
              </div>
              <div>
                <label className="lbl" htmlFor="f-email">
                  Email
                </label>
                <input
                  id="f-email"
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  autoComplete="email"
                  readOnly={Boolean(s.session)}
                />
                {errs.email && <p className="f-err">{errs.email}</p>}
                <p style={{ marginTop: 5, fontSize: 12, color: "var(--ink2)" }}>
                  {s.session ? "Signed in — this email is linked to your account." : "We'll use this email for your order confirmation."}
                </p>
              </div>
              <div className="f-full">
                <label className="lbl" htmlFor="f-addr">
                  Address
                </label>
                <input
                  id="f-addr"
                  className="input"
                  value={form.address}
                  onChange={set("address")}
                  autoComplete="street-address"
                  placeholder="House number, street and area"
                />
                {errs.address && <p className="f-err">{errs.address}</p>}
              </div>
              <div>
                <label className="lbl" htmlFor="f-city">
                  City
                </label>
                <input id="f-city" className="input" value={form.city} onChange={set("city")} autoComplete="address-level2" />
                {errs.city && <p className="f-err">{errs.city}</p>}
              </div>
              <div>
                <label className="lbl" htmlFor="f-zip">
                  ZIP / postal code
                </label>
                <input id="f-zip" className="input" value={form.zip} onChange={set("zip")} autoComplete="postal-code" />
                {errs.zip && <p className="f-err">{errs.zip}</p>}
              </div>
            </div>
          </section>

          <section className="panel checkout-panel">
            <h3>
              <span className="step-n">2</span> Payment method
            </h3>
            <div className="payment-methods" role="radiogroup" aria-label="Payment method">
              {MOCK_CARD_ENABLED && (
                <button
                  type="button"
                  className={`payment-option${paymentMethod === "card" ? " selected" : ""}`}
                  onClick={() => setPaymentMethod("card")}
                  aria-pressed={paymentMethod === "card"}
                >
                  <span className="payment-icon">
                    <Ic n="shield" s={18} />
                  </span>
                  <span>
                    <strong>Card</strong>
                    <small>Demo payment — no card is charged</small>
                  </span>
                  <span className="payment-check">{paymentMethod === "card" ? "✓" : ""}</span>
                </button>
              )}
              <button
                type="button"
                className={`payment-option${paymentMethod === "cod" ? " selected" : ""}`}
                onClick={() => setPaymentMethod("cod")}
                aria-pressed={paymentMethod === "cod"}
              >
                <span className="payment-icon">
                  <Ic n="truck" s={18} />
                </span>
                <span>
                  <strong>Cash on delivery</strong>
                  <small>Pay when your order arrives</small>
                </span>
                <span className="payment-check">{paymentMethod === "cod" ? "✓" : ""}</span>
              </button>
            </div>

            {paymentMethod === "card" ? (
              <div className="f-grid payment-fields">
                <div className="f-full">
                  <label className="lbl" htmlFor="f-card">
                    Card number
                  </label>
                  <input
                    id="f-card"
                    className="input"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="4242 4242 4242 4242"
                    value={form.card}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        card: event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 16)
                          .replace(/(.{4})/g, "$1 ")
                          .trim(),
                      }))
                    }
                  />
                  {errs.card && <p className="f-err">{errs.card}</p>}
                </div>
                <div>
                  <label className="lbl" htmlFor="f-exp">
                    Expiry
                  </label>
                  <input
                    id="f-exp"
                    className="input"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM/YY"
                    value={form.exp}
                    onChange={(event) => {
                      let value = event.target.value.replace(/\D/g, "").slice(0, 4);
                      if (value.length > 2) value = `${value.slice(0, 2)}/${value.slice(2)}`;
                      setForm((current) => ({ ...current, exp: value }));
                    }}
                  />
                  {errs.exp && <p className="f-err">{errs.exp}</p>}
                </div>
                <div>
                  <label className="lbl" htmlFor="f-cvc">
                    CVC
                  </label>
                  <input
                    id="f-cvc"
                    className="input"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="123"
                    value={form.cvc}
                    onChange={(event) => setForm((current) => ({ ...current, cvc: event.target.value.replace(/\D/g, "").slice(0, 3) }))}
                  />
                  {errs.cvc && <p className="f-err">{errs.cvc}</p>}
                </div>
              </div>
            ) : (
              <div className="cod-note">
                <span className="empty-ic">
                  <Ic n="truck" s={22} />
                </span>
                <div>
                  <strong>Cash on delivery selected</strong>
                  <p>You&apos;ll pay when the package arrives. This is a demo checkout for FikarNot.</p>
                </div>
              </div>
            )}
          </section>

          <div className="checkout-security">
            <span>
              <Ic n="mail" s={15} /> Confirmation will be associated with {form.email}
            </span>
            <span>
              <Ic n="check" s={15} /> Stock checked before order creation
            </span>
          </div>

          <button className="btn btn-lime checkout-submit" disabled={busy}>
            {busy ? "Placing your order…" : paymentLabel}
            {!busy && (
              <span>
                {fmt(totals.total)} <Ic n="arrow" s={15} />
              </span>
            )}
          </button>
        </form>

        <aside className="summary checkout-summary">
          <div className="checkout-summary-head">
            <div>
              <span className="eyebrow">Your bag</span>
              <h2 className="display">Order summary</h2>
            </div>
            <Link to="/cart">Edit</Link>
          </div>
          <div className="checkout-lines">
            {lines.map((line) => (
              <div className="checkout-line" key={line.p.id}>
                <img src={line.p.images?.[0] || line.p.image} alt="" />
                <div>
                  <strong>{line.p.name}</strong>
                  <span>Qty {line.qty}</span>
                </div>
                <b>{fmt(line.p.price * line.qty)}</b>
              </div>
            ))}
          </div>
          <form className="coupon-form" onSubmit={applyCoupon}>
            <label className="lbl" htmlFor="checkout-coupon">
              Promo code
            </label>
            <div className="coupon-input-row">
              <input
                id="checkout-coupon"
                className="input"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  setCouponError("");
                }}
                placeholder="WELCOME10"
                disabled={Boolean(appliedCoupon)}
              />
              {appliedCoupon ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={removeCoupon}>
                  Remove
                </button>
              ) : (
                <button type="submit" className="btn btn-dark btn-sm">
                  Apply
                </button>
              )}
            </div>
            {appliedCoupon && <p className="coupon-success">✓ {appliedCoupon.code} applied</p>}
            {couponError && <p className="f-err">{couponError}</p>}
          </form>
          <div className="sum-row">
            <span>Subtotal</span>
            <span>{fmt(totals.subtotal)}</span>
          </div>
          {totals.discount > 0 && (
            <div className="sum-row coupon-discount-row">
              <span>Discount</span>
              <span>-{fmt(totals.discount)}</span>
            </div>
          )}
          <div className="sum-row">
            <span>Shipping</span>
            <span>{totals.shipping === 0 ? "Free" : fmt(totals.shipping)}</span>
          </div>
          {totals.shipping > 0 && !appliedCoupon?.type?.includes("shipping") && (
            <div className="free-note">Add {fmt(75 - totals.subtotal)} more to unlock free shipping.</div>
          )}
          {appliedCoupon?.type === "free_shipping" && <div className="free-note">Free shipping unlocked with {appliedCoupon.code} ✦</div>}
          <div className="sum-row total">
            <span>Total</span>
            <span>{fmt(totals.total)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function OrderConfirmation({ order }) {
  const totalItems = order.items.reduce((count, item) => count + item.qty, 0);
  const paymentLabel = order.customer.paymentMethod === "cod" ? "Cash on delivery" : "Card (mock)";

  return (
    <div className="container order-confirmation-wrap">
      <div className="success order-confirmation">
        <div className="success-ic">
          <Ic n="check" s={28} />
        </div>
        <p className="eyebrow" style={{ justifyContent: "center" }}>
          FikarNot order confirmed
        </p>
        <h1 className="display" style={{ fontSize: 32 }}>
          Thanks for your order.
        </h1>
        <p className="confirmation-copy">
          Your order <strong>{order.id}</strong> has been created for <strong>{order.customer.name}</strong>.
        </p>

        <div className="confirmation-grid">
          <div>
            <span>Items</span>
            <strong>{totalItems}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{fmt(order.total)}</strong>
          </div>
          <div>
            <span>Payment</span>
            <strong>{paymentLabel}</strong>
          </div>
        </div>
        {order.coupon && (
          <div className="confirmation-address">
            <span>Promotion</span>
            <strong>
              {order.coupon.code} · {order.discount > 0 ? `Saved ${fmt(order.discount)}` : "Free shipping"}
            </strong>
          </div>
        )}

        <div className="confirmation-address">
          <span>Deliver to</span>
          <strong>{order.customer.address}</strong>
        </div>
        <div className="confirmation-address">
          <span>Confirmation email</span>
          <strong>{order.customer.email}</strong>
        </div>

        <div className="confirmation-actions">
          <Link className="btn btn-dark" to="/products">
            Keep shopping
          </Link>
          <Link className="btn btn-ghost" to="/account">
            View account
          </Link>
        </div>
      </div>
    </div>
  );
}
