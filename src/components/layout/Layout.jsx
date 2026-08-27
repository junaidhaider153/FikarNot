import { useEffect, useState } from "react";
import { Header, Marquee, Footer, Toast } from "../layout";
import { SiteStructuredData } from "../seo/StructuredData";
import { WHATSAPP_NUMBER } from "../../config/appConfig";
import { useApp } from "../../store/appStore";

export function WhatsAppFloat() {
  const s = useApp();
  const configuredNumber = s.siteSettings?.whatsappNumber || WHATSAPP_NUMBER;
  const message = encodeURIComponent("Hi FikarNot, I need help with my order.");
  const href = configuredNumber ? `https://wa.me/${configuredNumber.replace(/\D/g, "")}?text=${message}` : `https://wa.me/?text=${message}`;
  return (
    <a className="whatsapp-float" href={href} target="_blank" rel="noreferrer noopener" aria-label="Chat with FikarNot on WhatsApp">
      <span className="whatsapp-float-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M20.5 3.5A11.86 11.86 0 0 0 12.05 0C5.54 0 .25 5.29.25 11.8c0 2.08.54 4.1 1.56 5.89L.18 23.82l6.27-1.64a11.73 11.73 0 0 0 5.6 1.43h.01c6.5 0 11.79-5.29 11.79-11.8 0-3.15-1.23-6.11-3.35-8.31ZM12.06 21.58h-.01a9.74 9.74 0 0 1-4.97-1.36l-.36-.22-3.72.97.99-3.63-.23-.37a9.77 9.77 0 1 1 8.3 4.61Zm5.37-7.32c-.29-.15-1.72-.85-1.99-.95-.27-.1-.46-.15-.66.15-.19.29-.76.95-.93 1.14-.17.2-.34.22-.63.07-.29-.15-1.23-.45-2.35-1.44-.87-.77-1.45-1.72-1.62-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.2-.29.29-.49.1-.19.05-.36-.02-.51-.07-.15-.66-1.58-.9-2.17-.24-.57-.48-.49-.66-.5h-.56c-.19 0-.51.07-.78.36-.27.29-1.02.99-1.02 2.42s1.05 2.81 1.2 3.01c.15.19 2.07 3.17 5.01 4.44.7.3 1.24.48 1.66.61.7.22 1.34.19 1.84.12.56-.08 1.72-.7 1.97-1.38.24-.68.24-1.26.17-1.38-.07-.12-.27-.19-.56-.34Z" />
        </svg>
      </span>
      <span>Chat with us</span>
    </a>
  );
}

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button type="button" className="back-to-top" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
      ↑
    </button>
  );
}

export function Layout({ children }) {
  return (
    <>
      <SiteStructuredData />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header />
      <Marquee />
      <main id="main-content" className="app-main">
        {children}
      </main>
      <Footer />
      <Toast />
      <WhatsAppFloat />
      <BackToTop />
    </>
  );
}
