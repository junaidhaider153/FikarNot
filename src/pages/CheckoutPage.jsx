import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp, appActions, cartLines } from "../store/appStore";
import { fmt, delay } from "../utils/helpers";
import { Ic } from "../components/icons";
import { Empty } from "../components/common";

export default function CheckoutPage() {
  const s = useApp();
  const lines = cartLines(s);
  const [form, setForm] = useState({ name: s.session ? s.session.name : "", email: s.session ? s.session.email : "", address: "", city: "", zip: "", card: "", exp: "", cvc: "" });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const subtotal = +lines.reduce((t, l) => t + l.p.price * l.qty, 0).toFixed(2);
  const shipping = subtotal >= 75 ? 0 : 6.95;
  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (!form.name.trim()) er.name = "Required";
    if (!/.+@.+\..+/.test(form.email)) er.email = "Valid email required";
    if (!form.address.trim()) er.address = "Required";
    if (!form.city.trim()) er.city = "Required";
    if (!form.zip.trim()) er.zip = "Required";
    if (form.card.replace(/\D/g, "").length !== 16) er.card = "16 digits";
    if (!/^\d{2}\/\d{2}$/.test(form.exp)) er.exp = "MM/YY";
    if (!/^\d{3}$/.test(form.cvc)) er.cvc = "3 digits";
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true); await delay(1100);
    const order = appActions.placeOrder({ name: form.name, email: form.email, address: `${form.address}, ${form.city} ${form.zip}` });
    setBusy(false); setPlaced(order);
  };
  if (placed) return (
    <div className="container"><div className="success">
      <div className="success-ic"><Ic n="check" s={28} /></div>
      <h1 className="display" style={{ fontSize: 28 }}>Order confirmed</h1>
      <p style={{ color: "var(--ink2)", margin: "10px 0 4px" }}>Thanks {placed.customer.name.split(" ")[0]} — order <b>{placed.id}</b> is paid (mock) and being packed.</p>
      <p className="price" style={{ fontSize: 22, margin: "12px 0 22px" }}>{fmt(placed.total)}</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <Link className="btn btn-dark" to="/products">Keep shopping</Link>
        {s.session && ["admin", "editor"].includes(s.session.role) && <Link className="btn btn-ghost" to="/admin/orders">View orders</Link>}
      </div>
    </div></div>
  );
  if (lines.length === 0) return <div className="container" style={{ padding: "60px 24px" }}><Empty icon="cart" title="Nothing to check out" cta={<Link className="btn btn-dark" to="/products">Go to shop</Link>} /></div>;
  return (
    <div className="container checkout-grid">
      <form onSubmit={submit} noValidate>
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3><span className="step-n">1</span> Contact &amp; shipping</h3>
          <div className="f-grid">
            <div><label className="lbl" htmlFor="f-name">Full name</label><input id="f-name" className="input" value={form.name} onChange={set("name")} autoComplete="name" />{errs.name && <p className="f-err">{errs.name}</p>}</div>
            <div><label className="lbl" htmlFor="f-email">Email</label><input id="f-email" className="input" type="email" value={form.email} onChange={set("email")} autoComplete="email" />{errs.email && <p className="f-err">{errs.email}</p>}</div>
            <div className="f-full"><label className="lbl" htmlFor="f-addr">Address</label><input id="f-addr" className="input" value={form.address} onChange={set("address")} autoComplete="street-address" />{errs.address && <p className="f-err">{errs.address}</p>}</div>
            <div><label className="lbl" htmlFor="f-city">City</label><input id="f-city" className="input" value={form.city} onChange={set("city")} />{errs.city && <p className="f-err">{errs.city}</p>}</div>
            <div><label className="lbl" htmlFor="f-zip">ZIP</label><input id="f-zip" className="input" value={form.zip} onChange={set("zip")} />{errs.zip && <p className="f-err">{errs.zip}</p>}</div>
          </div>
        </div>
        <div className="panel">
          <h3><span className="step-n">2</span> Payment (mock)</h3>
          <div className="f-grid">
            <div className="f-full"><label className="lbl" htmlFor="f-card">Card number</label><input id="f-card" className="input" inputMode="numeric" placeholder="4242 4242 4242 4242" value={form.card} onChange={(e) => setForm({ ...form, card: e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim() })} />{errs.card && <p className="f-err">{errs.card}</p>}</div>
            <div><label className="lbl" htmlFor="f-exp">Expiry</label><input id="f-exp" className="input" placeholder="MM/YY" value={form.exp} onChange={(e) => { let v = e.target.value.replace(/[^\d]/g, "").slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2); setForm({ ...form, exp: v }); }} />{errs.exp && <p className="f-err">{errs.exp}</p>}</div>
            <div><label className="lbl" htmlFor="f-cvc">CVC</label><input id="f-cvc" className="input" inputMode="numeric" value={form.cvc} onChange={(e) => setForm({ ...form, cvc: e.target.value.replace(/\D/g, "").slice(0, 3) })} />{errs.cvc && <p className="f-err">{errs.cvc}</p>}</div>
          </div>
        </div>
        <button className="btn btn-lime" style={{ width: "100%", marginTop: 16 }} disabled={busy}>{busy ? "Processing payment…" : `Pay ${fmt(+(subtotal + shipping).toFixed(2))}`}</button>
      </form>
      <aside className="summary">
        <h3 className="display">Your order</h3>
        {lines.map((l) => <div className="sum-row" key={l.p.id}><span>{l.qty} × {l.p.name}</span><span>{fmt(l.p.price * l.qty)}</span></div>)}
        <div className="sum-row" style={{ marginTop: 8 }}><span>Shipping</span><span>{shipping === 0 ? "Free" : fmt(shipping)}</span></div>
        <div className="sum-row total"><span>Total</span><span>{fmt(+(subtotal + shipping).toFixed(2))}</span></div>
      </aside>
    </div>
  );
}

