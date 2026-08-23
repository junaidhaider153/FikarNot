import { Header, Marquee, Footer, Toast } from "../layout";

export function Layout({ children }) {
  return (
    <>
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
    </>
  );
}
