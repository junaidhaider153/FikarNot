import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom"; // 👈 Add this router import
import App from "./App";
import "./styles.css"; // Ensures your Tailwind/CSS styles load cleanly

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter> {/* 👈 Wraps and provides routing context globally */}
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
