import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Ic } from "../components/icons";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { siteApi } from "../api/siteApi";
import { useAsync } from "../hooks/useAsync";
const CONTENT = {
  about: {
    eyebrow: "About FikarNot",
    title: "Thoughtful things for everyday life.",
    intro:
      "FikarNot is a personal e-commerce project built around one simple idea: a smaller, more considered catalogue can make shopping easier.",
    sections: [
      [
        "Curated, not crowded",
        "We focus on useful objects, clear product information and a calmer browsing experience instead of overwhelming you with endless choices.",
      ],
      [
        "Built as a project",
        "FikarNot is a learning and portfolio project. Its store experience demonstrates real-world e-commerce patterns from catalogue to checkout and account management.",
      ],
      ["Designed for clarity", "From clean product cards to order tracking, the goal is to make every step understandable and pleasant."],
    ],
  },
  shipping: {
    eyebrow: "Shipping",
    title: "Shipping, clearly explained.",
    intro:
      "Shipping charges and thresholds are controlled by the current store settings and shown at checkout before you place an order.",
    sections: [
      ["Standard shipping", "The applicable flat shipping rate and free-shipping threshold are displayed during checkout."],
      ["Delivery updates", "Once an order is dispatched, the courier and tracking reference can be added by staff and shown against the order record."],
      ["Delays", "Delivery windows may vary by destination, stock availability and courier capacity. Support can provide order-specific updates."],
    ],
  },
  returns: {
    eyebrow: "Returns",
    title: "A straightforward return policy.",
    intro: "Eligible delivered orders can be submitted for return within the published return window. Approved returns are inspected before completion.",
    sections: [
      ["30-day window", "Return requests should be submitted within 30 days of delivery unless a different product-specific policy applies."],
      ["Condition", "Items should be unused and returned in reasonable condition with original packaging where applicable."],
      ["Need help?", "Use the Help Center contact form and include your order number so the support team can review the request."],
    ],
  },
  privacy: {
    eyebrow: "Privacy",
    title: "Privacy policy.",
    intro:
      "FikarNot processes the information needed to provide accounts, orders, support and delivery. Payment credentials should be handled by the selected payment provider and are not stored by FikarNot.",
    sections: [
      ["Information collected", "Account details, contact information, order details, support messages and operational records may be stored to fulfil purchases and provide support."],
      ["Payment information", "FikarNot does not need to store full card credentials. When live payments are enabled, customers are sent to the configured payment provider."],
      ["Retention and access", "Operational records are retained only as needed for order support, accounting, security and legal obligations and are restricted by application roles."],
    ],
  },
  terms: {
    eyebrow: "Terms",
    title: "Terms of service.",
    intro: "These terms describe the use of the FikarNot storefront, catalogue, orders and support services.",
    sections: [
      ["Orders", "An order becomes binding according to the checkout confirmation and the payment/fulfilment status recorded by FikarNot."],
      ["Prices and availability", "Product prices, stock, promotions and delivery estimates may change before an order is accepted or may be adjusted to correct an obvious error."],
      ["Acceptable use", "Do not misuse the storefront, attempt unauthorized access, submit fraudulent orders or interfere with other customers' accounts."],
    ],
  },
};
export default function StoreInfoPage({ page = "about" }) {
  const loc = useLocation();
  const { data: siteData } = useAsync(() => siteApi.get(), []);
  const site = siteData?.settings || {};
  const base = CONTENT[page] || CONTENT.about;
  const c = page === "about"
    ? {
        ...base,
        title: site.aboutTitle || base.title,
        intro: site.aboutIntro || base.intro,
        sections: site.aboutBody ? [["What is FikarNot?", site.aboutBody], ...base.sections.slice(1)] : base.sections,
      }
    : base;
  useDocumentMeta({ title: c.title, description: c.intro });
  useEffect(() => window.scrollTo(0, 0), [loc.pathname]);
  return (
    <div className="container info-page">
      <div className="info-hero">
        <span className="eyebrow">{c.eyebrow}</span>
        <h1 className="display info-title">{c.title}</h1>
        <p className="info-intro">{c.intro}</p>
      </div>
      <div className="info-grid">
        {c.sections.map(([title, text]) => (
          <article className="info-card" key={title}>
            <h2 className="display">{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <div className="info-cta">
        <div>
          <span className="eyebrow">Need a hand?</span>
          <h2 className="display">Visit the Help Center</h2>
          <p>Find answers to common questions or send FikarNot a support request.</p>
        </div>
        <Link className="btn btn-dark" to="/help">
          <Ic n="help" s={16} /> Help Center
        </Link>
      </div>
    </div>
  );
}
