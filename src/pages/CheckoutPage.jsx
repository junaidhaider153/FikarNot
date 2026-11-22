import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp, appActions, cartLines } from "../store/appStore";
import { fmt, delay } from "../utils/helpers";
import { Ic } from "../components/icons";
import { paymentsApi } from "../api/paymentsApi";
import { ordersApi } from "../api/ordersApi";
import { Empty } from "../components/common";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { FEATURES } from "../config/appConfig";
import { getPaymentAccounts } from "../config/paymentAccounts";

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
  const commerce = {
    currency: s.siteSettings?.currency || "PKR",
    currencyLocale: s.siteSettings?.currencyLocale || "en-PK",
    freeShippingThreshold: Number(s.siteSettings?.freeShippingThreshold || 5000),
    shippingFlatRate: Number(s.siteSettings?.shippingFlatRate || 500),
    taxRate: Number(s.siteSettings?.taxRate || 0),
    taxLabel: s.siteSettings?.taxLabel || "GST",
    allowCod: s.siteSettings?.allowCod !== "0",
    allowOnlinePayments: FEATURES.payfast && s.siteSettings?.allowOnlinePayments === "1",
    allowManualPayments: s.siteSettings?.allowManualPayments !== "0",
    manualPaymentDetails: getPaymentAccounts(s.siteSettings),
  };
  const manualMethods = useMemo(
    () =>
      [
        {
          key: "jazzcash",
          label: "JazzCash",
          detail: commerce.manualPaymentDetails.jazzcash?.number || commerce.manualPaymentDetails.jazzcashNumber,
        },
        {
          key: "easypaisa",
          label: "Easypaisa",
          detail: commerce.manualPaymentDetails.easypaisa?.number || commerce.manualPaymentDetails.easypaisaNumber,
        },
        {
          key: "bank_transfer",
          label: "Bank transfer",
          detail:
            commerce.manualPaymentDetails.bank?.name ||
            commerce.manualPaymentDetails.bank?.accountNumber ||
            commerce.manualPaymentDetails.bank?.iban ||
            commerce.manualPaymentDetails.bankName ||
            commerce.manualPaymentDetails.bankAccountNumber ||
            commerce.manualPaymentDetails.bankIban,
        },
      ].filter((method) => Boolean(method.detail) && commerce.allowManualPayments && Boolean(s.session)),
    [commerce.manualPaymentDetails, commerce.allowManualPayments, s.session],
  );
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
  const [paymentMethod, setPaymentMethod] = useState(commerce.allowOnlinePayments ? "payfast" : "cod");
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const detailsRef = useRef(null);
  const paymentRef = useRef(null);
  const summaryRef = useRef(null);

  const detailsComplete = Boolean(form.name.trim() && form.email.trim() && form.address.trim() && form.city.trim());
  const paymentComplete = Boolean(paymentMethod);
  const checkoutSteps = [
    { key: "details", label: "Details", ref: detailsRef, status: detailsComplete ? "complete" : "current" },
    {
      key: "payment",
      label: "Payment",
      ref: paymentRef,
      status: !detailsComplete ? "upcoming" : paymentComplete ? "complete" : "current",
    },
    {
      key: "review",
      label: "Review & place",
      ref: summaryRef,
      status: detailsComplete && paymentComplete ? "current" : "upcoming",
    },
  ];
  const scrollToStep = (ref) => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  useEffect(() => {
    const available = [
      ...(commerce.allowOnlinePayments ? ["payfast"] : []),
      ...(commerce.allowCod ? ["cod"] : []),
      ...manualMethods.map((method) => method.key),
    ];
    if (available.length === 0) {
      setPaymentMethod("");
      return;
    }
    if (!available.includes(paymentMethod)) setPaymentMethod(available[0]);
  }, [commerce.allowOnlinePayments, commerce.allowCod, paymentMethod, manualMethods]);

  const totals = useMemo(() => {
    const subtotal = +lines.reduce((total, line) => total + line.p.price * line.qty, 0).toFixed(2);
    const baseShipping = subtotal === 0 ? 0 : subtotal >= commerce.freeShippingThreshold ? 0 : commerce.shippingFlatRate;
    if (!appliedCoupon) {
      const tax = +((Math.max(0, subtotal) * commerce.taxRate) / 100).toFixed(2);
      return {
        subtotal,
        shipping: baseShipping,
        discount: 0,
        tax,
        total: +(subtotal + baseShipping + tax).toFixed(2),
        couponInvalidReason: "",
      };
    }
    const result = appActions.validateCoupon(appliedCoupon.code, subtotal, baseShipping);
    if (result.error)
      return {
        subtotal,
        shipping: baseShipping,
        discount: 0,
        tax: +((Math.max(0, subtotal) * commerce.taxRate) / 100).toFixed(2),
        total: +(subtotal + baseShipping + (Math.max(0, subtotal) * commerce.taxRate) / 100).toFixed(2),
        couponInvalidReason: result.error,
      };
    const shipping = result.shippingFree ? 0 : baseShipping;
    const tax = +((Math.max(0, subtotal - (result.discount || 0)) * commerce.taxRate) / 100).toFixed(2);
    return {
      subtotal,
      shipping,
      discount: result.discount || 0,
      tax,
      total: +(subtotal - (result.discount || 0) + shipping + tax).toFixed(2),
      couponInvalidReason: "",
    };
  }, [lines, appliedCoupon, commerce.freeShippingThreshold, commerce.shippingFlatRate, commerce.taxRate]);

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
    const baseShipping = totals.subtotal === 0 ? 0 : totals.subtotal >= commerce.freeShippingThreshold ? 0 : commerce.shippingFlatRate;
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
    if (paymentMethod === "payfast") {
      try {
        const session = await paymentsApi.createPayFastSession(order.id);
        const formElement = document.createElement("form");
        formElement.method = "POST";
        formElement.action = session.action;
        Object.entries(session.fields || {}).forEach(([name, value]) => {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = String(value ?? "");
          formElement.appendChild(input);
        });
        document.body.appendChild(formElement);
        formElement.submit();
        return;
      } catch (error) {
        appActions.toast(error.message || "Online payment could not be started.", "err");
        return;
      }
    }
    if (paymentMethod === "jazzcash" || paymentMethod === "easypaisa" || paymentMethod === "bank_transfer") {
      order.manualPaymentDetails = commerce.manualPaymentDetails;
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
                  <img src={line.p.images?.[0] || line.p.image} alt="" loading="lazy" />
                  <div>
                    <strong>{line.p.name}</strong>
                    <span>Qty {line.qty}</span>
                  </div>
                  <b>{fmt(line.p.price * line.qty, commerce.currency, commerce.currencyLocale)}</b>
                </div>
              ))}
            </div>
            <div className="sum-row">
              <span>Subtotal</span>
              <span>{fmt(totals.subtotal, commerce.currency, commerce.currencyLocale)}</span>
            </div>
            <div className="sum-row">
              <span>Shipping</span>
              <span>{totals.shipping === 0 ? "Free" : fmt(totals.shipping, commerce.currency, commerce.currencyLocale)}</span>
            </div>
            <div className="sum-row total">
              <span>Total</span>
              <span>{fmt(totals.total, commerce.currency, commerce.currencyLocale)}</span>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  const paymentLabel =
    paymentMethod === "payfast"
      ? "Continue to secure payment"
      : paymentMethod === "jazzcash" || paymentMethod === "easypaisa" || paymentMethod === "bank_transfer"
        ? "Place order & show payment details"
        : paymentMethod === "card"
          ? "Place demo card order"
          : "Place COD order";

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

      <ul className="checkout-steps" aria-label="Checkout progress">
        {checkoutSteps.map((step, index) => (
          <li key={step.key}>
            <button type="button" className={`checkout-step checkout-step-${step.status}`} onClick={() => scrollToStep(step.ref)}>
              <span className="checkout-step-dot">{step.status === "complete" ? <Ic n="check" s={12} /> : index + 1}</span>
              <span className="checkout-step-label">{step.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="checkout-grid">
        <form onSubmit={submit} noValidate>
          <section className="panel checkout-panel" ref={detailsRef}>
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

          <section className="panel checkout-panel" ref={paymentRef}>
            <h3>
              <span className="step-n">2</span> Payment method
            </h3>
            <div className="payment-methods" role="radiogroup" aria-label="Payment method">
              {commerce.allowOnlinePayments && (
                <button
                  type="button"
                  className={`payment-option${paymentMethod === "payfast" ? " selected" : ""}`}
                  onClick={() => setPaymentMethod("payfast")}
                  aria-pressed={paymentMethod === "payfast"}
                >
                  <span className="payment-icon">
                    <Ic n="shield" s={18} />
                  </span>
                  <span>
                    <strong>Online payment</strong>
                    <small>Secure checkout via PayFast</small>
                  </span>
                  <span className="payment-check">{paymentMethod === "payfast" ? "✓" : ""}</span>
                </button>
              )}
              {commerce.allowCod && (
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
              )}
              {manualMethods.map((method) => (
                <button
                  key={method.key}
                  type="button"
                  className={`payment-option${paymentMethod === method.key ? " selected" : ""}`}
                  onClick={() => setPaymentMethod(method.key)}
                  aria-pressed={paymentMethod === method.key}
                >
                  <span className="payment-icon">
                    <Ic n="shield" s={18} />
                  </span>
                  <span>
                    <strong>{method.label}</strong>
                    <small>Pay manually and upload your payment slip</small>
                  </span>
                  <span className="payment-check">{paymentMethod === method.key ? "✓" : ""}</span>
                </button>
              ))}
              {!s.session && commerce.allowManualPayments && (
                <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
                  Guests can pay by Cash on Delivery. <Link to={`/login?redirect=${encodeURIComponent("/checkout")}`}>Sign in</Link> to pay
                  by JazzCash, Easypaisa or bank transfer.
                </p>
              )}
              {!commerce.allowCod && !commerce.allowOnlinePayments && manualMethods.length === 0 && (
                <p role="alert" className="f-err">
                  No payment method is currently available. Please contact support.
                </p>
              )}
            </div>

            {paymentMethod === "payfast" ? (
              <div className="panel" style={{ marginTop: 16, padding: 16 }}>
                <strong>Secure online payment</strong>
                <p style={{ margin: "6px 0 0", color: "var(--ink2)", fontSize: 13 }}>
                  You will be redirected to the payment provider. Never enter your JazzCash/Easypaisa password or OTP into FikarNot.
                </p>
              </div>
            ) : ["jazzcash", "easypaisa", "bank_transfer"].includes(paymentMethod) ? (
              <ManualPaymentInstructions
                method={paymentMethod}
                details={commerce.manualPaymentDetails}
                amount={totals.total}
                currency={commerce.currency}
                locale={commerce.currencyLocale}
              />
            ) : (
              <div className="cod-note">
                <span className="empty-ic">
                  <Ic n="truck" s={22} />
                </span>
                <div>
                  <strong>Cash on delivery selected</strong>
                  <p>You&apos;ll pay when the package arrives.</p>
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
                {fmt(totals.total, commerce.currency, commerce.currencyLocale)} <Ic n="arrow" s={15} />
              </span>
            )}
          </button>
        </form>

        <aside className="summary checkout-summary" ref={summaryRef}>
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
                <img src={line.p.images?.[0] || line.p.image} alt="" loading="lazy" />
                <div>
                  <strong>{line.p.name}</strong>
                  <span>Qty {line.qty}</span>
                </div>
                <b>{fmt(line.p.price * line.qty, commerce.currency, commerce.currencyLocale)}</b>
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
            <span>{fmt(totals.subtotal, commerce.currency, commerce.currencyLocale)}</span>
          </div>
          {totals.discount > 0 && (
            <div className="sum-row coupon-discount-row">
              <span>Discount</span>
              <span>-{fmt(totals.discount, commerce.currency, commerce.currencyLocale)}</span>
            </div>
          )}
          <div className="sum-row">
            <span>Shipping</span>
            <span>{totals.shipping === 0 ? "Free" : fmt(totals.shipping, commerce.currency, commerce.currencyLocale)}</span>
          </div>
          {totals.shipping > 0 && !appliedCoupon?.type?.includes("shipping") && (
            <div className="free-note">
              Add {fmt(Math.max(0, commerce.freeShippingThreshold - totals.subtotal), commerce.currency, commerce.currencyLocale)} more to
              unlock free shipping.
            </div>
          )}
          {appliedCoupon?.type === "free_shipping" && <div className="free-note">Free shipping unlocked with {appliedCoupon.code} ✦</div>}
          {totals.tax > 0 && (
            <div className="sum-row">
              <span>{commerce.taxLabel}</span>
              <span>{fmt(totals.tax, commerce.currency, commerce.currencyLocale)}</span>
            </div>
          )}
          <div className="sum-row total">
            <span>Total</span>
            <span>{fmt(totals.total, commerce.currency, commerce.currencyLocale)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={copy}
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      style={{ padding: "2px 8px", fontSize: 12, lineHeight: 1.3, marginLeft: 8 }}
    >
      {copied ? "Copied! ✓" : label}
    </button>
  );
}

export function ManualPaymentInstructions({ method, details = {}, amount, currency = "PKR", locale = "en-PK", orderId }) {
  const label = method === "jazzcash" ? "JazzCash" : method === "easypaisa" ? "Easypaisa" : "Bank transfer";
  const formattedAmount = amount != null ? fmt(amount, currency, locale) : null;

  const jazzcash = details.jazzcash || {
    title: details.jazzcashTitle,
    number: details.jazzcashNumber,
    instructions: details.jazzcashInstructions,
  };
  const easypaisa = details.easypaisa || {
    title: details.easypaisaTitle,
    number: details.easypaisaNumber,
    instructions: details.easypaisaInstructions,
  };
  const bank = details.bank || {
    name: details.bankName,
    accountTitle: details.bankAccountTitle,
    accountNumber: details.bankAccountNumber,
    iban: details.bankIban,
    instructions: details.bankInstructions,
  };

  return (
    <div className="panel manual-payment-card" style={{ marginTop: 16, padding: 18, borderLeft: "4px solid var(--lime, #b8f029)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <strong style={{ fontSize: 16 }}>{label} payment instructions</strong>
        {formattedAmount && (
          <span style={{ fontSize: 14 }}>
            Payable Amount: <strong style={{ color: "var(--ink, #111)" }}>{formattedAmount}</strong>
            <CopyButton text={String(amount)} label="Copy" />
          </span>
        )}
      </div>

      <p style={{ margin: "8px 0 14px", color: "var(--ink2, #666)", fontSize: 13 }}>
        Complete the transfer in your banking or wallet app. FikarNot will never ask for your wallet MPIN, password or OTP.
      </p>

      {orderId ? (
        <div
          className="payment-remarks-reminder"
          style={{
            background: "rgba(184, 240, 41, 0.15)",
            border: "1px solid rgba(184, 240, 41, 0.4)",
            borderRadius: 6,
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <strong>Important Remarks / Reference:</strong>
            <div style={{ marginTop: 2 }}>
              Enter Order ID <code style={{ fontWeight: "bold", fontSize: 13 }}>{orderId}</code> in transfer remarks/memo.
            </div>
          </div>
          <CopyButton text={orderId} label="Copy Order ID" />
        </div>
      ) : (
        <div
          className="payment-remarks-reminder"
          style={{
            background: "rgba(184, 240, 41, 0.15)",
            border: "1px solid rgba(184, 240, 41, 0.4)",
            borderRadius: 6,
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          <strong>Transfer Remarks Reminder:</strong>
          <div style={{ marginTop: 2 }}>
            Please include your Order ID in the transfer remarks/reference when completing payment. (Your Order ID will be shown on the next
            screen once you place the order).
          </div>
        </div>
      )}

      {method === "jazzcash" && (
        <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
          {jazzcash.title && (
            <div>
              <span className="muted" style={{ fontSize: 12, display: "block" }}>
                Account title
              </span>
              <strong>{jazzcash.title}</strong>
            </div>
          )}
          {jazzcash.number && (
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <span className="muted" style={{ fontSize: 12, display: "block" }}>
                  JazzCash mobile number
                </span>
                <strong style={{ fontSize: 15 }}>{jazzcash.number}</strong>
              </div>
              <CopyButton text={jazzcash.number} label="Copy Number" />
            </div>
          )}
        </div>
      )}

      {method === "easypaisa" && (
        <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
          {easypaisa.title && (
            <div>
              <span className="muted" style={{ fontSize: 12, display: "block" }}>
                Account title
              </span>
              <strong>{easypaisa.title}</strong>
            </div>
          )}
          {easypaisa.number && (
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <span className="muted" style={{ fontSize: 12, display: "block" }}>
                  Easypaisa mobile number
                </span>
                <strong style={{ fontSize: 15 }}>{easypaisa.number}</strong>
              </div>
              <CopyButton text={easypaisa.number} label="Copy Number" />
            </div>
          )}
        </div>
      )}

      {method === "bank_transfer" && (
        <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
          {bank.name && (
            <div>
              <span className="muted" style={{ fontSize: 12, display: "block" }}>
                Bank name
              </span>
              <strong>{bank.name}</strong>
            </div>
          )}
          {bank.accountTitle && (
            <div>
              <span className="muted" style={{ fontSize: 12, display: "block" }}>
                Account title
              </span>
              <strong>{bank.accountTitle}</strong>
            </div>
          )}
          {bank.accountNumber && (
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <span className="muted" style={{ fontSize: 12, display: "block" }}>
                  Account number
                </span>
                <strong style={{ fontSize: 15 }}>{bank.accountNumber}</strong>
              </div>
              <CopyButton text={bank.accountNumber} label="Copy Account" />
            </div>
          )}
          {bank.iban && (
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <span className="muted" style={{ fontSize: 12, display: "block" }}>
                  IBAN
                </span>
                <strong style={{ fontSize: 15 }}>{bank.iban}</strong>
              </div>
              <CopyButton text={bank.iban} label="Copy IBAN" />
            </div>
          )}
          {bank.instructions && (
            <p style={{ marginTop: 4, color: "var(--ink2)", fontSize: 13, fontStyle: "italic" }}>{bank.instructions}</p>
          )}
        </div>
      )}

      <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--ink2)" }}>
        After sending payment, save your receipt or screenshot to upload as proof.
      </p>
    </div>
  );
}

export function OrderConfirmation({ order }) {
  const [proofBusy, setProofBusy] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(Boolean(order.paymentProof));
  const [proofError, setProofError] = useState("");
  const [reference, setReference] = useState(order.paymentReference || "");
  const [note, setNote] = useState(order.paymentNote || "");
  const [selectedFile, setSelectedFile] = useState(null);
  const [token] = useState(order.paymentProofToken || "");
  const manual = ["jazzcash", "easypaisa", "bank_transfer"].includes(order.paymentMethod);
  const isCancelled = order.status === "cancelled";
  const totalItems = (order.items || []).reduce((count, item) => count + item.qty, 0);
  const paymentLabel =
    order.paymentMethod === "cod"
      ? "Cash on delivery"
      : order.paymentMethod === "payfast"
        ? "Online payment"
        : order.paymentMethod === "jazzcash"
          ? "JazzCash"
          : order.paymentMethod === "easypaisa"
            ? "Easypaisa"
            : order.paymentMethod === "bank_transfer"
              ? "Bank transfer"
              : "Card (mock)";

  const handleUpload = async (e) => {
    if (e) e.preventDefault();
    if (!selectedFile) {
      setProofError("Please select a receipt or screenshot file to upload.");
      return;
    }
    if (isCancelled) {
      setProofError("Cannot upload payment proof for a cancelled order.");
      return;
    }
    if (selectedFile.size > 3 * 1024 * 1024) {
      setProofError("File size exceeds 3MB limit. Please upload a smaller file.");
      return;
    }
    setProofBusy(true);
    setProofError("");
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(selectedFile);
      });
      const result = await ordersApi.uploadPaymentProof(order.id, {
        dataUrl,
        originalName: selectedFile.name,
        token,
        email: order.customer?.email,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      setProofSubmitted(Boolean(result.proof));
      appActions.toast("Payment slip submitted for review.");
    } catch (error) {
      setProofError(error.message || "Payment slip could not be uploaded.");
    } finally {
      setProofBusy(false);
    }
  };

  return (
    <div className="container order-confirmation-wrap">
      <div className="success order-confirmation">
        <div className="confetti-burst" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className={`confetti-piece piece-${i}`} />
          ))}
        </div>
        <div className="success-ic celebrate">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" className="success-check-path" />
          </svg>
        </div>
        <p className="eyebrow" style={{ justifyContent: "center" }}>
          FikarNot order received
        </p>
        <h1 className="display" style={{ fontSize: 32 }}>
          Thanks for your order.
        </h1>
        <p className="confirmation-copy">
          Your order <strong>{order.id}</strong> has been created for <strong>{order.customer?.name}</strong>.
        </p>

        <ol className="order-next-steps">
          <li className="done">
            <span className="order-next-dot">
              <Ic n="check" s={12} />
            </span>
            Order placed
          </li>
          <li className={manual ? "" : "current"}>
            <span className="order-next-dot">2</span>
            {manual ? "Awaiting payment confirmation" : "Processing"}
          </li>
          <li>
            <span className="order-next-dot">3</span>
            Shipped
          </li>
          <li>
            <span className="order-next-dot">4</span>
            Delivered
          </li>
        </ol>

        <div className="confirmation-grid">
          <div>
            <span>Items</span>
            <strong>{totalItems}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{fmt(order.total, order.currency || "PKR", order.currency === "PKR" ? "en-PK" : undefined)}</strong>
          </div>
          <div>
            <span>Payment</span>
            <strong>{paymentLabel}</strong>
          </div>
        </div>

        {manual && order.manualPaymentDetails && (
          <ManualPaymentInstructions
            method={order.paymentMethod}
            details={order.manualPaymentDetails}
            amount={order.total}
            currency={order.currency || "PKR"}
            locale={order.currency === "PKR" ? "en-PK" : undefined}
            orderId={order.id}
          />
        )}

        {manual && (
          <form onSubmit={handleUpload} className="panel" style={{ marginTop: 16, padding: 18, textAlign: "left" }}>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>Upload payment proof</h3>
            <p style={{ margin: "0 0 14px", color: "var(--ink2)", fontSize: 13 }}>
              Upload your transaction screenshot or receipt (PNG, JPG, WebP, or GIF up to 3MB). Our team will verify it and begin processing
              your order.
            </p>

            {isCancelled ? (
              <p className="f-err" role="alert">
                This order has been cancelled. Payment proof can no longer be uploaded.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label className="lbl" htmlFor="proof-reference">
                    Transaction ID / Reference (optional)
                  </label>
                  <input
                    id="proof-reference"
                    className="input"
                    placeholder="e.g. TRX987654321 or Bank Transfer ID"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    disabled={proofBusy || proofSubmitted}
                    maxLength={100}
                  />
                  <span className="field-hint" style={{ fontSize: 12 }}>
                    The transaction ID or reference provided by your banking or wallet app.
                  </span>
                </div>

                <div>
                  <label className="lbl" htmlFor="proof-note">
                    Note / Remarks (optional)
                  </label>
                  <input
                    id="proof-note"
                    className="input"
                    placeholder="e.g. Paid from Meezan Bank mobile app"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={proofBusy || proofSubmitted}
                    maxLength={500}
                  />
                </div>

                <div>
                  <label className="lbl" htmlFor="proof-file">
                    Payment receipt / screenshot (Image)
                  </label>
                  <input
                    id="proof-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={proofBusy || proofSubmitted}
                    onChange={(e) => {
                      setSelectedFile(e.target.files?.[0] || null);
                      setProofError("");
                    }}
                  />
                  <span className="field-hint" style={{ fontSize: 12 }}>
                    Accepted formats: JPEG, PNG, WebP, GIF (Max 3MB).
                  </span>
                </div>

                <div>
                  <button type="submit" className="btn btn-lime btn-sm" disabled={proofBusy || proofSubmitted || !selectedFile}>
                    {proofBusy ? "Uploading…" : proofSubmitted ? "Proof submitted" : "Submit payment proof"}
                  </button>
                </div>
              </div>
            )}

            {proofSubmitted && (
              <p role="status" style={{ marginTop: 12, color: "var(--success, #16a34a)", fontWeight: "bold" }}>
                ✓ Payment proof submitted for review.
              </p>
            )}
            {proofError && (
              <p className="f-err" role="alert" style={{ marginTop: 10 }}>
                {proofError}
              </p>
            )}
          </form>
        )}

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
          <strong>{order.customer?.address}</strong>
        </div>
        <div className="confirmation-address">
          <span>Confirmation email</span>
          <strong>{order.customer?.email}</strong>
        </div>

        <div className="confirmation-actions">
          <Link className="btn btn-dark" to="/products">
            Keep shopping
          </Link>
          <Link className="btn btn-ghost" to="/account">
            View account
          </Link>
          {order.customer?.userId && (
            <Link className="btn btn-ghost" to={`/invoice/${encodeURIComponent(order.id)}`} target="_blank" rel="noreferrer">
              View invoice
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
