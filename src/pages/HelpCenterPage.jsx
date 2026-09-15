import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { Ic } from "../components/icons";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

const FAQS = [
  ["How much is shipping?", "Standard shipping is $6.95 on orders below $75. Orders of $75 or more qualify for free standard shipping."],
  [
    "Can I use a coupon at checkout?",
    "Yes. Open checkout and enter a valid promotion code. The cart must meet any minimum-subtotal or expiry rules configured for the coupon.",
  ],
  [
    "Can I cancel my order?",
    "For this personal project, order status is managed from the Studio. The customer-facing cancellation flow is intentionally simple for now.",
  ],
  ["How do I track my order?", "Open My Account → Orders and select an order to see its current status timeline."],
  [
    "Can I save products for later?",
    "Yes. Sign in and use the heart button on product cards or product detail pages to add products to your wishlist.",
  ],
  [
    "Where are my cart and wishlist stored?",
    "They are associated with your FikarNot account in the current browser-based project. Logging out clears the active session state and signing back in restores that account's saved data.",
  ],
  ["Are payments real?", "No. Checkout is a mock payment experience for this personal project. Do not enter real card information."],
  [
    "How can I contact FikarNot?",
    "Use the support form below. Signed-in users can also see support status updates through the notification center.",
  ],
];
function FAQItem({ question, answer, open, onToggle, panelId }) {
  return (
    <article className={`faq-item${open ? " open" : ""}`}>
      <button className="faq-question" type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span>{question}</span>
        <Ic n={open ? "minus" : "plus"} s={16} />
      </button>
      {open && (
        <p className="faq-answer" id={panelId}>
          {answer}
        </p>
      )}
    </article>
  );
}
export default function HelpCenterPage() {
  const s = useApp();
  const [openFaq, setOpenFaq] = useState(0);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(() => ({
    name: s.session?.name || "",
    email: s.session?.email || "",
    category: "general",
    subject: "",
    message: "",
  }));
  useDocumentMeta({ title: "Help Center", description: "Frequently asked questions and support for FikarNot." });
  const myTickets = useMemo(
    () => (s.session?.id && Array.isArray(s.supportTickets) ? s.supportTickets.filter((t) => t.userId === s.session.id).slice(0, 5) : []),
    [s.session, s.supportTickets],
  );
  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = "Required";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Enter a valid email";
    if (!form.subject.trim()) next.subject = "Required";
    if (form.message.trim().length < 10) next.message = "Please provide a little more detail";
    setErrors(next);
    if (Object.keys(next).length) return;
    const ticket = appActions.submitSupportTicket(form);
    if (ticket) {
      setSent(true);
      setForm((prev) => ({ ...prev, subject: "", message: "" }));
    }
  };
  return (
    <div className="container help-page">
      <div className="help-hero">
        <span className="eyebrow">Support</span>
        <h1 className="display">How can we help?</h1>
        <p>
          Find a quick answer below or send us a message. Signed-in customers can follow support requests through FikarNot notifications.
        </p>
      </div>
      <div className="help-grid">
        <section className="panel faq-panel">
          <div className="sec-hd">
            <div>
              <span className="eyebrow">FAQ</span>
              <h2 className="sec-title display">Common questions</h2>
            </div>
          </div>
          <div className="faq-list">
            {FAQS.map(([q, a], i) => (
              <FAQItem
                key={q}
                question={q}
                answer={a}
                open={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
                panelId={`faq-panel-${i}`}
              />
            ))}
          </div>
        </section>
        <section className="panel support-form-panel">
          <div className="sec-hd">
            <div>
              <span className="eyebrow">Contact</span>
              <h2 className="sec-title display">Send a support request</h2>
            </div>
          </div>
          {sent ? (
            <div className="success support-success">
              <div className="success-ic">
                <Ic n="check" s={28} />
              </div>
              <h3 className="display">Message received</h3>
              <p>Your request has been added to the FikarNot support inbox.</p>
              {s.session && <p style={{ color: "var(--ink2)", marginBottom: 18 }}>You’ll see status updates in your notifications.</p>}
              <button className="btn btn-dark" onClick={() => setSent(false)}>
                Send another request
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="f-grid">
                <div>
                  <label className="lbl" htmlFor="support-name">
                    Name
                  </label>
                  <input
                    id="support-name"
                    className="input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                  {errors.name && <p className="f-err">{errors.name}</p>}
                </div>
                <div>
                  <label className="lbl" htmlFor="support-email">
                    Email
                  </label>
                  <input
                    id="support-email"
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  {errors.email && <p className="f-err">{errors.email}</p>}
                </div>
                <div>
                  <label className="lbl" htmlFor="support-category">
                    Category
                  </label>
                  <select
                    id="support-category"
                    className="select"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    <option value="general">General question</option>
                    <option value="order">Order help</option>
                    <option value="product">Product question</option>
                    <option value="return">Return / refund</option>
                    <option value="account">Account help</option>
                  </select>
                </div>
                <div>
                  <label className="lbl" htmlFor="support-subject">
                    Subject
                  </label>
                  <input
                    id="support-subject"
                    className="input"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="How can we help?"
                  />
                  {errors.subject && <p className="f-err">{errors.subject}</p>}
                </div>
                <div className="f-full">
                  <label className="lbl" htmlFor="support-message">
                    Message
                  </label>
                  <textarea
                    id="support-message"
                    className="textarea"
                    rows="7"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Tell us what happened…"
                  />
                  {errors.message && <p className="f-err">{errors.message}</p>}
                </div>
              </div>
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginTop: 18, flexWrap: "wrap" }}
              >
                <p className="form-hint">This personal project stores support requests in the browser.</p>
                <button className="btn btn-dark">
                  <Ic n="mail" s={15} /> Send request
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
      {s.session && (
        <section className="section support-history">
          <div className="sec-hd">
            <div>
              <span className="eyebrow">Your requests</span>
              <h2 className="sec-title display">Support history</h2>
            </div>
          </div>
          {!myTickets.length ? (
            <p style={{ color: "var(--ink2)" }}>You haven’t sent a support request yet.</p>
          ) : (
            <div className="support-ticket-grid">
              {myTickets.map((t) => (
                <article className="support-ticket-card" key={t.id}>
                  <div className="support-ticket-top">
                    <strong>{t.id}</strong>
                    <span className={`support-status ${t.status}`}>{t.status.replace("_", " ")}</span>
                  </div>
                  <h3>{t.subject}</h3>
                  <p>{t.message}</p>
                  <time>{new Date(t.createdAt).toLocaleString()}</time>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      <div className="info-cta">
        <div>
          <span className="eyebrow">Store information</span>
          <h2 className="display">Need policies or store details?</h2>
          <p>Read the pages for shipping, returns, privacy, terms, and the story behind FikarNot.</p>
        </div>
        <div className="help-link-row">
          <Link to="/about">About</Link>
          <Link to="/shipping">Shipping</Link>
          <Link to="/returns">Returns</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
      </div>
    </div>
  );
}
