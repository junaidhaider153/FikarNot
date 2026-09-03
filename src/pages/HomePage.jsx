import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp, appActions } from "../store/appStore";
import { IMG } from "../assets/assets";
import { Ic } from "../components/icons";
import { ProductCard } from "../components/ProductCard";
import { HeroVideo } from "../components/HeroVideo";
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
  const featured = list.filter((p) => p.featured).slice(0, 4);
  const fresh = [...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  const popular = [...list].sort((a, b) => b.rating - a.rating).slice(0, 4);
  const averageRating = useMemo(() => {
    if (!list.length) return "0.0";
    return (list.reduce((sum, p) => sum + p.rating, 0) / list.length).toFixed(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depending on `products`, not the derived `list` (a fresh array reference every render), so this actually memoizes.
  }, [products]);
  const countFor = (id) => s.products.filter((p) => p.categoryId === id).length;
  const activeOffers = (s.coupons || []).filter((coupon) => isCouponUsable(coupon)).slice(0, 3);
  const recent = resolveRecentlyViewed(s.recentlyViewed, list, 4);

  // Full-bleed hero backdrop.
  // Drop an mp4 (and optionally a webm) in `public/media/` — e.g. /media/hero-loop.mp4 —
  // or set `heroVideo` in Studio. Until then the poster image is used with a slow
  // Ken-Burns pan, so the hero never looks empty.
  const heroPoster = site.heroImage || IMG.hero;
  const heroVideoSrc = site.heroVideo || "";
  const heroVideoWebm = site.heroVideoWebm || "";

  const subscribe = (event) => {
    event.preventDefault();
    const value = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      appActions.toast("Enter a valid email address", "err");
      return;
    }
    appActions.toast("You're on the FikarNot list ✦");
    setEmail("");
  };

  return (
    <>
      {/* Full-bleed cinematic hero: video fills the whole band, copy sits on top of it. */}
      <section className="hero-cinema" aria-label="FikarNot introduction">
        <HeroVideo
          src={heroVideoSrc}
          webm={heroVideoWebm}
          poster={heroPoster}
          alt="FikarNot products arranged on a warm cream surface"
        />

        <div className="container hero-cinema-inner">
          <div className="hero-cinema-copy">
            <span className="hero-kicker">{site.heroKicker || "Curated essentials · Free shipping over $75"}</span>
            <span className="eyebrow">{site.heroEyebrow || "FikarNot — objects for the everyday"}</span>
            <h1 className="h1 hero-cinema-title">
              <span className="hero-title-line">{site.heroTitle || "Everyday essentials,"}</span>
              <span className="hero-title-line">
                <em>{site.heroHighlight || "beautifully chosen."}</em>
              </span>
            </h1>
            <p className="hero-sub hero-cinema-sub">
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
          </div>

          <div className="hero-cinema-stats" aria-label="Store highlights">
            <div>
              <b>{averageRating}</b>
              <span>catalogue rating</span>
            </div>
            <div>
              <b>{list.length}</b>
              <span>curated products</span>
            </div>
            <div>
              <b>{s.categories.length}</b>
              <span>focused categories</span>
            </div>
            <div>
              <b>{site.heroSticker || "New drop"}</b>
              <span>in store now</span>
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
              <div className="cat-count">{countFor(c.id)} items</div>
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
