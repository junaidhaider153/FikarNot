import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css"; // Ensures your Tailwind/CSS styles load cleanly

// Last-resort safety net: if something throws outside of any React error
// boundary (an event handler, a timer callback, a rejected promise) React
// can be left with nothing committed to the DOM, i.e. a genuinely blank
// white page with no way for the person to recover except guessing to hit
// refresh. This listens at the window level and, if the #root container is
// empty when that happens, injects a plain-HTML "something went wrong,
// here's a reload button" message that doesn't depend on React at all.
function showFallbackIfBlank() {
  const root = document.getElementById("root");
  if (!root || root.children.length > 0) return;
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,sans-serif;background:#faf9f6;">
      <div style="max-width:420px;text-align:center;">
        <h1 style="font-size:20px;margin-bottom:8px;">Something went wrong</h1>
        <p style="color:#6b6558;margin-bottom:20px;">This page hit an unexpected error while loading. Reloading usually fixes it.</p>
        <button onclick="window.location.reload()" style="background:#161310;color:#fff;border:none;border-radius:10px;padding:12px 20px;font-size:14px;font-weight:600;cursor:pointer;">Reload page</button>
      </div>
    </div>`;
}
window.addEventListener("error", () => setTimeout(showFallbackIfBlank, 50));
window.addEventListener("unhandledrejection", () => setTimeout(showFallbackIfBlank, 50));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
