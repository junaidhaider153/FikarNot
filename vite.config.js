import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const toOrigin = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseOrigin = toOrigin(env.VITE_SUPABASE_URL);
  if (!supabaseOrigin && mode === "production") {
    throw new Error("VITE_SUPABASE_URL is required for a production build (it is also used to build the Content-Security-Policy).");
  }

  return {
    plugins: [
      react(),
      {
        // Fills the CSP placeholders in index.html with this environment's Supabase origin.
        name: "fikarnot-build-csp",
        transformIndexHtml(html) {
          return html.replaceAll("__SUPABASE_ORIGIN__", supabaseOrigin || "");
        },
      },
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory-vendor")) {
              return "recharts";
            }
          },
        },
      },
    },
  };
});
