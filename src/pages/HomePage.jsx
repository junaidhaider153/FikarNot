import { useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { IMG, GALLERY } from "../assets/assets";
import { Ic } from "../components/icons";
import { ProductCard } from "../components/ProductCard";
import { HeroSlider } from "../components/HeroSlider";
import { Empty, SkelGrid } from "../components/common";
import { api } from "../api/storeApi";
import { siteApi } from "../api/siteApi";
import { useAsync } from "../hooks/useAsync";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { APP_DESCRIPTION } from "../config/appConfig";
import { couponDescription, isCouponUsable } from "../utils/coupons";
import { resolveRecentlyViewed } from "../utils/recommendations";

const PRINCIPLES = [
  {
    icon: "check",
    title: "Curated, not crowded",
    text: "A focused catalogue built around products that feel useful, durable and easy to live with.",
  },
  {
    icon: "shield",
    title: "Made for the everyday",
    text: "From your desk to your commute, every category is designed around practical daily routines.",
  },
  {
    icon: "refresh",
    title: "Easy to keep, easy to return",
    text: "Clear product details, simple returns and helpful support keep the experience straightforward.",
  },
];

export default function HomePage() {
  const s = useApp();
  const [email, setEmail] = useState("");
  const { data: products, loading } = useAsync(() => api.listProducts(), []);
  const { data: siteData } = useAsync(() => siteApi.get(), []);
  const site = siteData?.settings || {};
  useDocumentMeta({ title: "Everyday Products", description: APP_DESCRIPTION });
  const list = products || [];

  // Memoize expensive array operations to prevent recalculation on every render
  const featured = useMemo(() => 
    list.filter((p) => p.featured).slice(0, 4), 
    [list]
  );

  const fresh = useMemo(() => 
    [...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4), 
    [list]
  );

  const popular = useMemo(() => 
    [...list].sort((a, b) => b.rating - a.rating).slice(0, 4), 
    [list]
  );

  // Memoize category count lookup to avoid O(n) filter for each category
  const categoryCounts = useMemo(() => {
    const counts = {};
    s.categories.forEach((cat) => {
      counts[cat.id] = s.products.filter((p) => p.categoryId === cat.id).length;
    });
    return counts;
  }, [s.products, s.categories]);

  const averageRating = useMemo(() => {
    if (!list.length) return "0.0";
    return (list.reduce((sum, p) => sum + p.rating, 0) / list.length).toFixed(1);
  }, [list]);

  const activeOffers = useMemo(() => 
    (s.coupons || []).filter((coupon) => isCouponUsable(coupon)).slice(0, 3),
    [s.coupons]
  );

  const recent = useMemo(() => 
    resolveRecentlyViewed(s.recentlyViewed, list, 4),
    [s.recentlyViewed, list]
  );

  // Hero slider: opens on the existing hero shot, then cycles a few catalogue images.
  // To add a real video slide once you have footage, drop the file in `public/media/`
  // and add an entry here, e.g.:
  //   { id: "video", type: "video", src: "/media/hero-loop.mp4", poster: IMG.hero }
  const heroSlides = useMemo(() => [
    { id: "hero", type: "image", src: site.heroImage || IMG.hero, alt: "FikarNot products arranged on a warm cream surface" },
    ...GALLERY.slice(0, 3).map(([key, url]) => ({ id: key, type: "image", src: url, alt: `${key} from the FikarNot catalogue` })),
  ], [site.heroImage]);

  const subscribe = useCallback((event) => {
    event.preventDefault();
    const value = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      appActions.toast("Enter a valid email address", "err");
      return;
    }
    appActions.toast("You're on the FikarNot list ✦");
    setEmail("");
  }, [email]);

  return (
    <>
      <section className="container hero hero-modern">
        <div className="hero-copy">
          <span className="hero-kicker">{site.heroKicker || "Curated essentials · Free shipping over $75"}</span>
          <span className="eyebrow">{site.heroEyebrow || "FikarNot — objects for the everyday"}</span>
          <h1 className="h1">
            {site.heroTitle || "Everyday essentials,"}
            <br />
            <em>{site.heroHighlight || "beautifully chosen."}</em>
          </h1>
          <p className="hero-sub">
            {site.heroSubtitle || "Discover a refined mix of tech, desk and everyday carry — selected for utility, character and the way they fit into real life."}
          </p>
          <div className="hero-cta">
            <Link className="btn btn-dark" to="/products">
              Shop new arrivals <Ic n="arrow" s={15} />
            </Link>
            <Link className="btn btn-ghost" to="/products?cat=c1">
              Browse audio
            </Link>
          </div>
          <div className="hero-proof-row" aria-label="Store benefits">
            <span>
              <b>4.8</b> average rating
            </span>
            <span>
              <b>30-day</b> easy returns
            </span>
            <span>
              <b>Secure</b> checkout
            </span>
          </div>
          <div className="hero-stats" aria-label="Store highlights">
            <div>
              <b>{averageRating}</b>catalogue rating
            </div>
            <div>
              <b>{list.length}</b>curated products
            </div>
            <div>
              <b>{s.categories.length}</b>focused categories
            </div>
          </div>
        </div>
        <div className="hero-media hero-visual">
          <span className="hero-orb hero-orb-a" aria-hidden="true" />
          <span className="hero-orb hero-orb-b" aria-hidden="true" />
          <HeroSlider slides={heroSlides} />
          <span className="sticker">{site.heroSticker || "NEW SEASON DROP"}</span>
          <div className="hero-float-card hero-float-card-top">
            <span className="hero-float-icon">✦</span>
            <div>
              <strong>Thoughtfully picked</strong>
              <small>less clutter, better finds</small>
            </div>
          </div>
          <div className="hero-float-card hero-float-card-bottom">
            <span className="hero-float-score">4.8</span>
            <div>
              <strong>Customer favourite</strong>
              <small>across the catalogue</small>
            </div>
          </div>
        </div>
      </section>

      <section className="container section home-section section-categories" style={{ paddingTop: 8 }}>
        <div className="sec-hd">
          <div>
            <span className="eyebrow">Start somewhere</span>
            <h2 className="sec-title display">Shop by category</h2>
          </div>
          <Link className="sec-link" to="/products">
            View all <Ic n="arrow" s={14} />
          </Link>
        </div>
        <div className="cat-grid">
          {s.categories.map((c) => (
            <Link key={c.id} className="cat-card" to={`/products?cat=${c.id}`}>
              <span className="cat-dot" style={{ background: c.color }} />
              <h3>{c.name}</h3>
              <p>{c.description}</p>
              <div className="cat-count">{categoryCounts[c.id] || 0} items</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="container section home-section section-featured">
        <div className="sec-hd">
          <div>
            <span className="eyebrow">Hand-picked</span>
            <h2 className="sec-title display">Featured this season</h2>
          </div>
          <Link className="sec-link" to="/products">
            Shop all <Ic n="arrow" s={14} />
          </Link>
        </div>
        {loading ? (
          <SkelGrid n={4} />
        ) : featured.length ? (
          <div className="prod-grid">
            {featured.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <Empty title="No featured products yet" sub="Mark a few products as featured in Studio and they'll appear here." />
        )}
      </section>

      {activeOffers.length > 0 && (
        <section className="container section offers-section home-section">
          <div className="sec-hd">
            <div>
              <span className="eyebrow">Small offers, no noise</span>
              <h2 className="sec-title display">Current FikarNot offers</h2>
            </div>
            <Link className="sec-link" to="/checkout">
              Use at checkout <Ic n="arrow" s={14} />
            </Link>
          </div>
          <div className="offer-grid">
            {activeOffers.map((coupon) => (
              <article className="offer-card" key={coupon.id}>
                <div>
                  <span className="offer-code">{coupon.code}</span>
                  <strong>{couponDescription(coupon)}</strong>
                  <p>{coupon.description || "Apply this code at checkout."}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    try {
                      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
                      await navigator.clipboard.writeText(coupon.code);
                      appActions.toast(`${coupon.code} copied ✦`);
                    } catch {
                      appActions.toast(`Use code ${coupon.code}`);
                    }
                  }}
                >
                  Copy code
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="container section home-section">
        <div className="principles">
          <div className="principles-copy">
            <span className="eyebrow">The FikarNot idea</span>
            <h2 className="section-display display">
              Less noise.
              <br />
              Better choices.
            </h2>
            <p>
              We keep the catalogue focused so browsing feels intentional. FikarNot is a small collection of practical objects with a clear
              point of view.
            </p>
            <Link className="btn btn-dark btn-sm" to="/products">
              Explore the collection <Ic n="arrow" s={14} />
            </Link>
          </div>
          <div className="principles-grid">
            {PRINCIPLES.map((item) => (
              <article className="principle-card" key={item.title}>
                <span className="principle-icon">
                  <Ic n={item.icon} s={17} />
                </span>
                <h3 className="display">{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container section home-section">
        <div className="promo">
          <div>
            <span className="eyebrow eyebrow-light">Made for daily use</span>
            <h3 className="display">Built to be used daily, kept for years.</h3>
            <p>Simple objects, thoughtful details and a catalogue that stays intentionally small.</p>
          </div>
          <div className="pts">
            <div>
              <span className="icw">
                <Ic n="truck" s={17} />
              </span>
              Free ship over $75
            </div>
            <div>
              <span className="icw">
                <Ic n="refresh" s={17} />
              </span>
              30-day returns
            </div>
            <div>
              <span className="icw">
                <Ic n="shield" s={17} />
              </span>
              2-year warranty
            </div>
          </div>
          <Link className="btn btn-lime" to="/products">
            Start shopping
          </Link>
        </div>
      </section>

      <section className="container section home-section">
        <div className="sec-hd">
          <div>
            <span className="eyebrow">Highest rated</span>
            <h2 className="sec-title display">Popular right now</h2>
          </div>
          <Link className="sec-link" to="/products">
            See top rated <Ic n="arrow" s={14} />
          </Link>
        </div>
        {loading ? (
          <SkelGrid n={4} />
        ) : (
          <div className="prod-grid">
            {popular.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      <section className="container section home-section">
        <div className="sec-hd">
          <div>
            <span className="eyebrow">Fresh from the catalogue</span>
            <h2 className="sec-title display">Just landed</h2>
          </div>
          <Link className="sec-link" to="/products">
            Shop all <Ic n="arrow" s={14} />
          </Link>
        </div>
        {loading ? (
          <SkelGrid n={4} />
        ) : (
          <div className="prod-grid">
            {fresh.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section className="container section home-section">
          <div className="sec-hd">
            <div>
              <span className="eyebrow">Pick up where you left off</span>
              <h2 className="sec-title display">Recently viewed</h2>
            </div>
            <Link className="sec-link" to="/recently-viewed">
              View history <Ic n="arrow" s={14} />
            </Link>
          </div>
          <div className="prod-grid">
            {recent.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}

      <section className="container section section-last home-section">
        <div className="newsletter">
          <div>
            <span className="eyebrow">Stay in the loop</span>
            <h2 className="section-display display">
              New drops.
              <br />
              No inbox clutter.
            </h2>
            <p>Join the FikarNot list for new products, small offers and catalogue updates.</p>
          </div>
          <form className="newsletter-form" onSubmit={subscribe}>
            <label className="sr-only" htmlFor="home-email">
              Email address
            </label>
            <input
              id="home-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <button className="btn btn-dark" type="submit">
              Join the list <Ic n="arrow" s={14} />
            </button>
            <span className="newsletter-note">Demo signup — no email is sent yet.</span>
          </form>
        </div>
      </section>
    </>
  );
}
