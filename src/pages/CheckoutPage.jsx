import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp, appActions, cartLines } from "../store/appStore";
import { fmt, delay } from "../utils/helpers";
import { Ic } from "../components/icons";
import { paymentsApi } from "../api/paymentsApi";
import { ordersApi } from "../api/ordersApi";
import { uploadsApi } from "../api/uploadsApi";
import { Empty } from "../components/common";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

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
  const commerce = { currency: s.siteSettings?.currency || "PKR", currencyLocale: s.siteSettings?.currencyLocale || "en-PK", freeShippingThreshold: Number(s.siteSettings?.freeShippingThreshold || 5000), shippingFlatRate: Number(s.siteSettings?.shippingFlatRate || 500), taxRate: Number(s.siteSettings?.taxRate || 0), taxLabel: s.siteSettings?.taxLabel || "GST", allowCod: s.siteSettings?.allowCod !== "0", allowOnlinePayments: s.siteSettings?.allowOnlinePayments === "1", allowManualPayments: s.siteSettings?.allowManualPayments !== "0", manualPaymentDetails: { jazzcashNumber: s.siteSettings?.jazzcashNumber || "", easypaisaNumber: s.siteSettings?.easypaisaNumber || "", bankName: s.siteSettings?.bankName || "", bankAccountTitle: s.siteSettings?.bankAccountTitle || "", bankAccountNumber: s.siteSettings?.bankAccountNumber || "", bankIban: s.siteSettings?.bankIban || "", bankInstructions: s.siteSettings?.bankInstructions || "" } };
  const manualMethods = [
    { key: "jazzcash", label: "JazzCash", detail: commerce.manualPaymentDetails.jazzcashNumber },
    { key: "easypaisa", label: "Easypaisa", detail: commerce.manualPaymentDetails.easypaisaNumber },
    { key: "bank_transfer", label: "Bank transfer", detail: commerce.manualPaymentDetails.bankName || commerce.manualPaymentDetails.bankAccountNumber || commerce.manualPaymentDetails.bankIban },
  ].filter((method) => method.detail && commerce.allowManualPayments);
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
  }, [commerce.allowOnlinePayments, commerce.allowCod, paymentMethod]);

  const totals = useMemo(() => {
    const subtotal = +lines.reduce((total, line) => total + line.p.price * line.qty, 0).toFixed(2);
    const baseShipping = subtotal === 0 ? 0 : subtotal >= commerce.freeShippingThreshold ? 0 : commerce.shippingFlatRate;
    if (!appliedCoupon) {
      const tax = +(Math.max(0, subtotal) * commerce.taxRate / 100).toFixed(2);
      return { subtotal, shipping: baseShipping, discount: 0, tax, total: +(subtotal + baseShipping + tax).toFixed(2), couponInvalidReason: "" };
    }
    const result = appActions.validateCoupon(appliedCoupon.code, subtotal, baseShipping);
    if (result.error)
      return {
        subtotal,
        shipping: baseShipping,
        discount: 0,
        tax: +(Math.max(0, subtotal) * commerce.taxRate / 100).toFixed(2),
        total: +(subtotal + baseShipping + Math.max(0, subtotal) * commerce.taxRate / 100).toFixed(2),
        couponInvalidReason: result.error,
      };
    const shipping = result.shippingFree ? 0 : baseShipping;
    const tax = +(Math.max(0, subtotal - (result.discount || 0)) * commerce.taxRate / 100).toFixed(2);
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
                  <img src={line.p.images?.[0] || line.p.image} alt="" />
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

  const paymentLabel = paymentMethod === "payfast" ? "Continue to secure payment" : paymentMethod === "jazzcash" || paymentMethod === "easypaisa" || paymentMethod === "bank_transfer" ? "Place order & show payment details" : paymentMethod === "card" ? "Place demo card order" : "Place COD order";

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
              {commerce.allowOnlinePayments && (
                <button type="button" className={`payment-option${paymentMethod === "payfast" ? " selected" : ""}`} onClick={() => setPaymentMethod("payfast")} aria-pressed={paymentMethod === "payfast"}>
                  <span className="payment-icon"><Ic n="shield" s={18} /></span>
                  <span><strong>Online payment</strong><small>Secure checkout via PayFast</small></span>
                  <span className="payment-check">{paymentMethod === "payfast" ? "✓" : ""}</span>
                </button>
              )}
              {commerce.allowCod && (
                <button type="button" className={`payment-option${paymentMethod === "cod" ? " selected" : ""}`} onClick={() => setPaymentMethod("cod")} aria-pressed={paymentMethod === "cod"}>
                  <span className="payment-icon"><Ic n="truck" s={18} /></span>
                  <span><strong>Cash on delivery</strong><small>Pay when your order arrives</small></span>
                  <span className="payment-check">{paymentMethod === "cod" ? "✓" : ""}</span>
                </button>
              )}
              {manualMethods.map((method) => (
                <button key={method.key} type="button" className={`payment-option${paymentMethod === method.key ? " selected" : ""}`} onClick={() => setPaymentMethod(method.key)} aria-pressed={paymentMethod === method.key}>
                  <span className="payment-icon"><Ic n="shield" s={18} /></span>
                  <span><strong>{method.label}</strong><small>Pay manually and upload your payment slip</small></span>
                  <span className="payment-check">{paymentMethod === method.key ? "✓" : ""}</span>
                </button>
              ))}
              {!commerce.allowCod && !commerce.allowOnlinePayments && manualMethods.length === 0 && <p role="alert" className="f-err">No payment method is currently available. Please contact support.</p>}
            </div>

            {paymentMethod === "payfast" ? (
              <div className="panel" style={{ marginTop: 16, padding: 16 }}><strong>Secure online payment</strong><p style={{ margin: "6px 0 0", color: "var(--ink2)", fontSize: 13 }}>You will be redirected to the payment provider. Never enter your JazzCash/Easypaisa password or OTP into FikarNot.</p></div>
            ) : ["jazzcash", "easypaisa", "bank_transfer"].includes(paymentMethod) ? (
              <ManualPaymentInstructions method={paymentMethod} details={commerce.manualPaymentDetails} />
            ) : (
              <div className="cod-note">
                <span className="empty-ic"><Ic n="truck" s={22} /></span>
                <div><strong>Cash on delivery selected</strong><p>You&apos;ll pay when the package arrives.</p></div>
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
            <div className="free-note">Add {fmt(Math.max(0, commerce.freeShippingThreshold - totals.subtotal), commerce.currency, commerce.currencyLocale)} more to unlock free shipping.</div>
          )}
          {appliedCoupon?.type === "free_shipping" && <div className="free-note">Free shipping unlocked with {appliedCoupon.code} ✦</div>}
          {totals.tax > 0 && (
            <div className="sum-row"><span>{commerce.taxLabel}</span><span>{fmt(totals.tax, commerce.currency, commerce.currencyLocale)}</span></div>
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

function ManualPaymentInstructions({ method, details }) {
  const label = method === "jazzcash" ? "JazzCash" : method === "easypaisa" ? "Easypaisa" : "Bank transfer";
  return (
    <div className="panel" style={{ marginTop: 16, padding: 16 }}>
      <strong>{label} payment instructions</strong>
      <p style={{ margin: "6px 0 12px", color: "var(--ink2)", fontSize: 13 }}>Complete the transfer in your own banking/wallet app. FikarNot will never ask for your wallet password, MPIN or OTP.</p>
      {method === "jazzcash" && <div><b>JazzCash number:</b> {details.jazzcashNumber}</div>}
      {method === "easypaisa" && <div><b>Easypaisa number:</b> {details.easypaisaNumber}</div>}
      {method === "bank_transfer" && <div style={{ display: "grid", gap: 4 }}>
        {details.bankName && <div><b>Bank:</b> {details.bankName}</div>}
        {details.bankAccountTitle && <div><b>Account title:</b> {details.bankAccountTitle}</div>}
        {details.bankAccountNumber && <div><b>Account number:</b> {details.bankAccountNumber}</div>}
        {details.bankIban && <div><b>IBAN:</b> {details.bankIban}</div>}
      </div>}
      {details.bankInstructions && method === "bank_transfer" && <p style={{ marginTop: 10, color: "var(--ink2)", fontSize: 13 }}>{details.bankInstructions}</p>}
      <p style={{ margin: "12px 0 0", fontSize: 13 }}>After payment, keep your receipt/screenshot ready. You can upload it immediately after placing the order.</p>
    </div>
  );
}
function OrderConfirmation({ order }) {
  const [proofBusy, setProofBusy] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(Boolean(order.paymentProof));
  const [proofError, setProofError] = useState("");
  const [token] = useState(order.paymentProofToken || "");
  const manual = ["jazzcash", "easypaisa", "bank_transfer"].includes(order.paymentMethod);
  const totalItems = order.items.reduce((count, item) => count + item.qty, 0);
  const paymentLabel = order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentMethod === "payfast" ? "Online payment" : order.paymentMethod === "jazzcash" ? "JazzCash" : order.paymentMethod === "easypaisa" ? "Easypaisa" : order.paymentMethod === "bank_transfer" ? "Bank transfer" : "Card (mock)";
  
  const uploadProof = async (file) => {
    if (!file) return;
    setProofBusy(true); 
    setProofError("");
    try {
      const dataUrl = await new Promise((resolve, reject) => { 
        const r = new FileReader(); 
        r.onload = () => resolve(r.result); 
        r.onerror = reject; 
        r.readAsDataURL(file); 
      });
      const result = await ordersApi.uploadPaymentProof(order.id, { dataUrl, originalName: file.name, token, email: order.customer.email });
      setProofSubmitted(Boolean(result.proof));
    } catch (error) { 
      setProofError(error.message || "Payment slip could not be uploaded."); 
    } finally { 
      setProofBusy(false); 
    }
  };

  return (
    <div className="container order-confirmation-wrap">
      <div className="success order-confirmation">
        <div className="success-ic"><Ic n="check" s={28} /></div>
        <p className="eyebrow" style={{ justifyContent: "center" }}>FikarNot order received</p>
        <h1 className="display" style={{ fontSize: 32 }}>Thanks for your order.</h1>
        <p className="confirmation-copy">Your order <strong>{order.id}</strong> has been created for <strong>{order.customer.name}</strong>.</p>
        
        <div className="confirmation-grid">
          <div><span>Items</span><strong>{totalItems}</strong></div>
          <div><span>Total</span><strong>{fmt(order.total, order.currency || "PKR", order.currency === "PKR" ? "en-PK" : undefined)}</strong></div>
          <div><span>Payment</span><strong>{paymentLabel}</strong></div>
        </div>

        {manual && order.manualPaymentDetails && <ManualPaymentInstructions method={order.paymentMethod} details={order.manualPaymentDetails} />}
        
        {manual && (
          <div className="panel" style={{ marginTop: 16, padding: 16, textAlign: "left" }}>
            <strong>Upload your payment slip</strong>
            <p style={{ margin: "6px 0 12px", color: "var(--ink2)", fontSize: 13 }}>Upload a clear screenshot or receipt. Staff will review it before the order moves to fulfilment.</p>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={proofBusy || proofSubmitted} onChange={(e) => { uploadProof(e.target.files?.[0]); e.target.value = ""; }} />
            {proofSubmitted && <p role="status" style={{ marginTop: 10 }}>✓ Payment slip submitted for review.</p>}
            {proofError && <p className="f-err" role="alert">{proofError}</p>}
          </div>
        )}

        {order.coupon && (
          <div className="confirmation-address">
            <span>Promotion</span>
            <strong>
              {order.coupon.code} · {order.discount > 0 ? `Saved ${fmt(order.discount)}` : "Free shipping"}
            </strong>
          </div>
        )}

        <div className="confirmation-address"><span>Deliver to</span><strong>{order.customer.address}</strong></div>
        <div className="confirmation-address"><span>Confirmation email</span><strong>{order.customer.email}</strong></div>
        
        <div className="confirmation-actions">
          <Link className="btn btn-dark" to="/products">Keep shopping</Link>
          <Link className="btn btn-ghost" to="/account">View account</Link>
          {order.customer.userId && (
            <a className="btn btn-ghost" href={`${import.meta.env.VITE_API_URL || ""}/api/orders/${encodeURIComponent(order.id)}/invoice`} target="_blank" rel="noreferrer">View invoice</a>
          )}
        </div>
      </div>
    </div>
  );
}
