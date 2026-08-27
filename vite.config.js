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
  const apiOrigin = toOrigin(env.VITE_API_URL);
  const uploadsOrigin = toOrigin(env.VITE_UPLOADS_PUBLIC_BASE_URL);
  const extraConnect = apiOrigin ? ` ${apiOrigin}` : "";
  const extraImages = [apiOrigin, uploadsOrigin].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(" ");

  return {
    plugins: [
      react(),
      {
        name: "fikarnot-build-csp",
        transformIndexHtml(html) {
          return html.replace(
            /connect-src 'self'([^;]*); img-src 'self'([^;]*);/,
            (_, connectRest, imageRest) => `connect-src 'self'${extraConnect}${connectRest}; img-src 'self'${extraImages ? ` ${extraImages}` : ""}${imageRest};`,
          );
        },
      },
    ],
    server: {
      proxy: {
        "/api": "http://localhost:8787",
        "/uploads": "http://localhost:8787",
      },
    },
  };
});
