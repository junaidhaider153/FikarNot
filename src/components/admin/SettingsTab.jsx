import { useEffect, useState } from "react";
import { FEATURES } from "../../config/appConfig";
import { appActions } from "../../store/appStore";
import { prepareImageFile, MAX_IMAGE_BYTES } from "../../utils/imageUpload";
import { uploadsApi } from "../../api/uploadsApi";
import { siteApi } from "../../api/siteApi";
import { HeroVideoField } from "../HeroVideoField";
import { SkelForm } from "../common";
import { DEFAULT_PAYMENT_FORM_FIELDS } from "../../config/paymentAccounts";

export function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [heroUploading, setHeroUploading] = useState(false);
  const [heroUploadError, setHeroUploadError] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState("");
  const [heroImages, setHeroImages] = useState([]);
  const [navLinks, setNavLinks] = useState([]);
  const [form, setForm] = useState({
    storeName: "FikarNot",
    supportEmail: "support@fikarnot.shop",
    heroKicker: "",
    heroEyebrow: "",
    heroTitle: "",
    heroHighlight: "",
    heroSubtitle: "",
    heroSticker: "",
    heroImage: "",
    heroVideo: "",
    heroVideoWebm: "",
    logoUrl: "",
    announcement: "",
    aboutTitle: "",
    aboutIntro: "",
    aboutBody: "",
    whatsappNumber: "923709072688",
    instagramUrl: "",
    facebookUrl: "",
    metaTitle: "",
    metaDescription: "",
    currency: "PKR",
    currencyLocale: "en-PK",
    freeShippingThreshold: "5000",
    shippingFlatRate: "500",
    taxRate: "0",
    taxLabel: "GST",
    allowCod: "1",
    allowOnlinePayments: "0",
    allowManualPayments: "1",
    ...DEFAULT_PAYMENT_FORM_FIELDS,
  });
  useEffect(() => {
    let alive = true;
    siteApi
      .get()
      .then((result) => {
        if (!alive) return;
        const settings = result.settings || {};
        setForm((current) => ({ ...current, ...settings }));
        let parsedHeroImages = [];
        try {
          parsedHeroImages = JSON.parse(settings.heroImages || "[]");
        } catch {
          parsedHeroImages = [];
        }
        if (!Array.isArray(parsedHeroImages) || !parsedHeroImages.length) {
          parsedHeroImages = settings.heroImage ? [settings.heroImage] : [];
        }
        setHeroImages(parsedHeroImages.filter(Boolean));
        let parsedNavLinks = [];
        try {
          parsedNavLinks = JSON.parse(settings.navLinks || "[]");
        } catch {
          parsedNavLinks = [];
        }
        setNavLinks(Array.isArray(parsedNavLinks) ? parsedNavLinks : []);
      })
      .catch(() => appActions.toast("Could not load store settings", "err"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const uploadHeroImage = async (file) => {
    if (!file) return;
    setHeroUploading(true);
    setHeroUploadError("");
    try {
      const dataUrl = await prepareImageFile(file);
      const result = await uploadsApi.uploadImage(dataUrl, file.name);
      setHeroImages((current) => [...current, result.url]);
      appActions.toast("Hero image added. Save settings to publish it.");
    } catch (error) {
      setHeroUploadError(error.message || "Could not upload hero image.");
    } finally {
      setHeroUploading(false);
    }
  };
  const removeHeroImage = (index) => setHeroImages((current) => current.filter((_, i) => i !== index));
  const uploadLogo = async (file) => {
    if (!file) return;
    setLogoUploading(true);
    setLogoUploadError("");
    try {
      const dataUrl = await prepareImageFile(file, { maxDimension: 400 });
      const result = await uploadsApi.uploadImage(dataUrl, file.name);
      set("logoUrl", result.url);
      appActions.toast("Logo uploaded. Save settings to publish it.");
    } catch (error) {
      setLogoUploadError(error.message || "Could not upload logo.");
    } finally {
      setLogoUploading(false);
    }
  };
  const addNavLink = () => setNavLinks((current) => [...current, { label: "", url: "" }]);
  const updateNavLink = (index, key, value) =>
    setNavLinks((current) => current.map((link, i) => (i === index ? { ...link, [key]: value } : link)));
  const removeNavLink = (index) => setNavLinks((current) => current.filter((_, i) => i !== index));
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const cleanNavLinks = navLinks
        .map((link) => ({ label: (link.label || "").trim(), url: (link.url || "").trim() }))
        .filter((link) => link.label && link.url);
      const payload = {
        ...form,
        heroImage: heroImages[0] || "",
        heroImages: JSON.stringify(heroImages),
        navLinks: JSON.stringify(cleanNavLinks),
      };
      await appActions.updateSiteSettings(payload);
    } catch {
      // toast already shown by updateSiteSettings
    } finally {
      setSaving(false);
    }
  };
  if (loading)
    return (
      <div className="panel">
        <SkelForm rows={6} />
      </div>
    );
  return (
    <form className="panel" onSubmit={save}>
      <h3 className="display">Store & homepage settings</h3>
      <p style={{ color: "var(--ink2)", marginBottom: 18 }}>
        These settings are stored in the backend. Change them here instead of editing the React source.
      </p>
      <div className="f-grid">
        <div>
          <label className="lbl" htmlFor="settings-store-name">
            Store name
          </label>
          <input id="settings-store-name" className="input" value={form.storeName} onChange={(e) => set("storeName", e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-support-email">
            Support email
          </label>
          <input
            id="settings-support-email"
            className="input"
            type="email"
            value={form.supportEmail}
            onChange={(e) => set("supportEmail", e.target.value)}
          />
        </div>
        <div className="f-full">
          <label className="lbl" htmlFor="settings-logo">
            Store logo
          </label>
          <div className="media-upload-inline">
            <input
              id="settings-logo"
              className="input"
              placeholder="https://… or upload from device"
              value={form.logoUrl}
              onChange={(e) => set("logoUrl", e.target.value)}
            />
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
                {logoUploading ? "Uploading…" : "Upload from device"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  disabled={logoUploading}
                  onChange={(e) => {
                    uploadLogo(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="image-hint">Square image works best · up to {Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB</span>
              {form.logoUrl && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("logoUrl", "")}>
                  Remove logo
                </button>
              )}
            </div>
            {logoUploadError && <p className="f-err">{logoUploadError}</p>}
            {form.logoUrl && (
              <div className="hero-image-setting-preview" style={{ maxWidth: 80 }}>
                <img src={form.logoUrl} alt="Current logo preview" loading="lazy" />
              </div>
            )}
          </div>
        </div>
        <div className="f-full">
          <label className="lbl" htmlFor="settings-kicker">
            Hero kicker
          </label>
          <input id="settings-kicker" className="input" value={form.heroKicker} onChange={(e) => set("heroKicker", e.target.value)} />
        </div>
        <div className="f-full">
          <label className="lbl" htmlFor="settings-eyebrow">
            Hero eyebrow
          </label>
          <input id="settings-eyebrow" className="input" value={form.heroEyebrow} onChange={(e) => set("heroEyebrow", e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-title">
            Hero title
          </label>
          <input id="settings-title" className="input" value={form.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-highlight">
            Hero highlight
          </label>
          <input
            id="settings-highlight"
            className="input"
            value={form.heroHighlight}
            onChange={(e) => set("heroHighlight", e.target.value)}
          />
        </div>
        <div className="f-full">
          <label className="lbl" htmlFor="settings-subtitle">
            Hero subtitle
          </label>
          <textarea
            id="settings-subtitle"
            className="textarea"
            value={form.heroSubtitle}
            onChange={(e) => set("heroSubtitle", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-sticker">
            Hero sticker
          </label>
          <input id="settings-sticker" className="input" value={form.heroSticker} onChange={(e) => set("heroSticker", e.target.value)} />
        </div>
        <div className="f-full">
          <HeroVideoField
            id="settings-hero-video"
            label="Hero background video (MP4)"
            value={form.heroVideo}
            poster={heroImages[0] || ""}
            onChange={(value) => set("heroVideo", value)}
          />
        </div>
        <div className="f-full">
          <HeroVideoField
            id="settings-hero-video-webm"
            label="Hero background video — WebM (optional, smaller file)"
            hint="Optional WebM version. Browsers that support it will load this instead of the MP4."
            value={form.heroVideoWebm}
            poster={heroImages[0] || ""}
            onChange={(value) => set("heroVideoWebm", value)}
          />
        </div>
        <div className="f-full">
          <label className="lbl" htmlFor="settings-hero-image">
            Hero slider images
          </label>
          <div className="media-upload-inline">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
                {heroUploading ? "Uploading…" : "Add an image"}
                <input
                  id="settings-hero-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  disabled={heroUploading}
                  onChange={(e) => {
                    uploadHeroImage(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="image-hint">
                Add as many as you like · they play as a slider on the homepage · up to {Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB
                each
              </span>
            </div>
            {heroUploadError && <p className="f-err">{heroUploadError}</p>}
            {heroImages.length > 0 && (
              <div className="hero-image-list" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                {heroImages.map((src, i) => (
                  <div className="hero-image-setting-preview" key={`${src}-${i}`} style={{ position: "relative", maxWidth: 140 }}>
                    <img src={src} alt={`Hero slide ${i + 1}`} loading="lazy" />
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      style={{ marginTop: 6, width: "100%" }}
                      onClick={() => removeHeroImage(i)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!heroImages.length && (
              <p style={{ color: "var(--ink2)", fontSize: 13, marginTop: 8 }}>
                No hero images yet — the homepage will fall back to the default artwork.
              </p>
            )}
          </div>
        </div>
        <div className="f-full">
          <label className="lbl" htmlFor="settings-announcement">
            Announcement bar
          </label>
          <input
            id="settings-announcement"
            className="input"
            value={form.announcement}
            onChange={(e) => set("announcement", e.target.value)}
          />
          <p style={{ color: "var(--ink2)", fontSize: 12, marginTop: 4 }}>
            Separate multiple messages with a newline, a pipe ( | ) or a middle dot ( · ) to scroll several items.
          </p>
        </div>
        <div className="f-full">
          <span className="lbl">Extra navigation links</span>
          {navLinks.map((link, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <input
                className="input"
                placeholder="Label (e.g. Blog)"
                value={link.label}
                onChange={(e) => updateNavLink(i, "label", e.target.value)}
                style={{ flex: "1 1 160px" }}
              />
              <input
                className="input"
                placeholder="/blog or https://…"
                value={link.url}
                onChange={(e) => updateNavLink(i, "url", e.target.value)}
                style={{ flex: "2 1 220px" }}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeNavLink(i)}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addNavLink}>
            + Add nav link
          </button>
          <p style={{ color: "var(--ink2)", fontSize: 12, marginTop: 6 }}>
            These appear in the header (after &quot;Shop&quot;) and in the mobile menu.
          </p>
        </div>
        <div className="f-full">
          <h4 className="display" style={{ margin: "12px 0 4px" }}>
            Commerce & checkout
          </h4>
        </div>
        <div>
          <label className="lbl" htmlFor="settings-currency">
            Currency
          </label>
          <input
            id="settings-currency"
            className="input"
            value={form.currency}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
            maxLength={3}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-locale">
            Currency locale
          </label>
          <input
            id="settings-locale"
            className="input"
            value={form.currencyLocale}
            onChange={(e) => set("currencyLocale", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-free-shipping">
            Free shipping threshold
          </label>
          <input
            id="settings-free-shipping"
            className="input"
            inputMode="decimal"
            value={form.freeShippingThreshold}
            onChange={(e) => set("freeShippingThreshold", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-shipping-rate">
            Flat shipping rate
          </label>
          <input
            id="settings-shipping-rate"
            className="input"
            inputMode="decimal"
            value={form.shippingFlatRate}
            onChange={(e) => set("shippingFlatRate", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-tax-rate">
            Tax / GST rate (%)
          </label>
          <input
            id="settings-tax-rate"
            className="input"
            inputMode="decimal"
            value={form.taxRate}
            onChange={(e) => set("taxRate", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-tax-label">
            Tax label
          </label>
          <input id="settings-tax-label" className="input" value={form.taxLabel} onChange={(e) => set("taxLabel", e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-cod">
            Cash on delivery
          </label>
          <select id="settings-cod" className="select" value={form.allowCod} onChange={(e) => set("allowCod", e.target.value)}>
            <option value="1">Enabled</option>
            <option value="0">Disabled</option>
          </select>
        </div>
        {FEATURES.payfast && (
          <div>
            <label className="lbl" htmlFor="settings-online">
              Online payments
            </label>
            <select
              id="settings-online"
              className="select"
              value={form.allowOnlinePayments}
              onChange={(e) => set("allowOnlinePayments", e.target.value)}
            >
              <option value="0">Disabled</option>
              <option value="1">Enabled — requires PayFast configuration</option>
            </select>
          </div>
        )}
        <div>
          <label className="lbl" htmlFor="settings-manual-payments">
            Manual wallet/bank payments
          </label>
          <select
            id="settings-manual-payments"
            className="select"
            value={form.allowManualPayments}
            onChange={(e) => set("allowManualPayments", e.target.value)}
          >
            <option value="1">Enabled</option>
            <option value="0">Disabled</option>
          </select>
        </div>
        <div className="f-full">
          <h4 className="display" style={{ margin: "12px 0 4px" }}>
            Manual payment details
          </h4>
        </div>
        <div>
          <label className="lbl" htmlFor="settings-jazzcash">
            JazzCash number
          </label>
          <input
            id="settings-jazzcash"
            className="input"
            placeholder="923001234567"
            value={form.jazzcashNumber}
            onChange={(e) => set("jazzcashNumber", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-jazzcash-title">
            JazzCash account title
          </label>
          <input
            id="settings-jazzcash-title"
            className="input"
            placeholder="FikarNot Store"
            value={form.jazzcashTitle || ""}
            onChange={(e) => set("jazzcashTitle", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-easypaisa">
            Easypaisa number
          </label>
          <input
            id="settings-easypaisa"
            className="input"
            placeholder="923001234567"
            value={form.easypaisaNumber}
            onChange={(e) => set("easypaisaNumber", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-easypaisa-title">
            Easypaisa account title
          </label>
          <input
            id="settings-easypaisa-title"
            className="input"
            placeholder="FikarNot Store"
            value={form.easypaisaTitle || ""}
            onChange={(e) => set("easypaisaTitle", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-bank-name">
            Bank name
          </label>
          <input id="settings-bank-name" className="input" value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-bank-title">
            Account title
          </label>
          <input
            id="settings-bank-title"
            className="input"
            value={form.bankAccountTitle}
            onChange={(e) => set("bankAccountTitle", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-bank-account">
            Account number
          </label>
          <input
            id="settings-bank-account"
            className="input"
            value={form.bankAccountNumber}
            onChange={(e) => set("bankAccountNumber", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-bank-iban">
            IBAN
          </label>
          <input id="settings-bank-iban" className="input" value={form.bankIban} onChange={(e) => set("bankIban", e.target.value)} />
        </div>
        <div className="f-full">
          <label className="lbl" htmlFor="settings-bank-instructions">
            Payment instructions
          </label>
          <textarea
            id="settings-bank-instructions"
            className="textarea"
            placeholder="e.g. Use your order ID as the transfer reference."
            value={form.bankInstructions}
            onChange={(e) => set("bankInstructions", e.target.value)}
          />
        </div>
        <div className="f-full">
          <p style={{ color: "var(--ink2)", fontSize: 12, margin: 0 }}>
            Current default launch currency is PKR. Existing product numeric prices are not automatically converted; review catalogue
            pricing before enabling live sales.
          </p>
        </div>
        <div className="f-full">
          <h4 className="display" style={{ margin: "12px 0 4px" }}>
            About page
          </h4>
        </div>
        <div className="f-full">
          <label className="lbl" htmlFor="settings-about-title">
            About title
          </label>
          <input id="settings-about-title" className="input" value={form.aboutTitle} onChange={(e) => set("aboutTitle", e.target.value)} />
        </div>
        <div className="f-full">
          <label className="lbl" htmlFor="settings-about-intro">
            About intro
          </label>
          <textarea
            id="settings-about-intro"
            className="textarea"
            value={form.aboutIntro}
            onChange={(e) => set("aboutIntro", e.target.value)}
          />
        </div>
        <div className="f-full">
          <label className="lbl" htmlFor="settings-about-body">
            About body
          </label>
          <textarea
            id="settings-about-body"
            className="textarea"
            value={form.aboutBody}
            onChange={(e) => set("aboutBody", e.target.value)}
          />
        </div>
        <div className="f-full">
          <h4 className="display" style={{ margin: "12px 0 4px" }}>
            Contact, social & SEO
          </h4>
        </div>
        <div>
          <label className="lbl" htmlFor="settings-whatsapp">
            WhatsApp number
          </label>
          <input
            id="settings-whatsapp"
            className="input"
            placeholder="923001234567"
            value={form.whatsappNumber}
            onChange={(e) => set("whatsappNumber", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-instagram">
            Instagram URL
          </label>
          <input
            id="settings-instagram"
            className="input"
            value={form.instagramUrl}
            onChange={(e) => set("instagramUrl", e.target.value)}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-facebook">
            Facebook URL
          </label>
          <input id="settings-facebook" className="input" value={form.facebookUrl} onChange={(e) => set("facebookUrl", e.target.value)} />
        </div>
        <div>
          <label className="lbl" htmlFor="settings-meta-title">
            SEO title
          </label>
          <input id="settings-meta-title" className="input" value={form.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} />
        </div>
        <div className="f-full">
          <label className="lbl" htmlFor="settings-meta-description">
            SEO description
          </label>
          <textarea
            id="settings-meta-description"
            className="textarea"
            value={form.metaDescription}
            onChange={(e) => set("metaDescription", e.target.value)}
          />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button className="btn btn-dark" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
