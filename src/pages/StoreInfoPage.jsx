import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Ic } from "../components/icons";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
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
    title: "Simple delivery, clearly explained.",
    intro:
      "This demo store uses a simple shipping model so you can focus on the shopping experience while keeping the rules easy to understand.",
    sections: [
      ["Standard shipping", "Orders under $75 use the demo standard rate of $6.95."],
      [
        "Free shipping",
        "Orders of $75 or more qualify for free standard shipping. Eligible free-shipping coupons can also remove the shipping charge.",
      ],
      [
        "Order processing",
        "Orders are created immediately in this browser-based project and move through the order status timeline from paid to processing, shipped and delivered.",
      ],
    ],
  },
  returns: {
    eyebrow: "Returns",
    title: "A straightforward return policy.",
    intro: "This personal project uses a simple demo return policy to model how a real storefront might communicate post-purchase support.",
    sections: [
      ["30-day window", "The demo policy allows return requests within 30 days of delivery."],
      ["Condition", "Items should be unused and returned in reasonable condition with original packaging where applicable."],
      ["Need help?", "Use the Help Center contact form and include your order number so the support team can review the request."],
    ],
  },
  privacy: {
    eyebrow: "Privacy",
    title: "Your demo data stays in your browser.",
    intro:
      "FikarNot is currently a browser-based personal project. Most account, cart, wishlist and order data is stored in localStorage on the device running the site.",
    sections: [
      [
        "What is stored",
        "The project stores demo account data, catalogue information, cart and wishlist state, notifications, support requests and order information in local browser storage.",
      ],
      ["No real payment processing", "The current checkout is a mock experience. Do not enter real financial credentials."],
      [
        "Demo environment",
        "Because this is a local project, its current storage model should not be treated as production-grade privacy or security infrastructure.",
      ],
    ],
  },
  terms: {
    eyebrow: "Terms",
    title: "Demo store terms of use.",
    intro: "These terms describe the intended use of the FikarNot personal project.",
    sections: [
      ["Personal project", "FikarNot is a demonstration and learning project, not a live commercial store."],
      ["No real purchases", "Orders, payments, shipping and promotional codes are simulated within the application."],
      [
        "Use responsibly",
        "Avoid entering sensitive personal, payment or credential information that you would not want stored in a browser-based demo.",
      ],
    ],
  },
};
export default function StoreInfoPage({ page = "about" }) {
  const loc = useLocation();
  const c = CONTENT[page] || CONTENT.about;
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
