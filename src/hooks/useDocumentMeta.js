import { useEffect } from "react";
import { APP_NAME } from "../config/appConfig";

const SITE_URL = "https://www.fikarnot.shop";

const setMetaContent = (name, content, attr = "name") => {
  if (!content) return;
  let tag = document.querySelector(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

const setCanonical = (url) => {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = url;
};

/**
 * Route-aware metadata helper for the SPA.
 * `canonical` should be an absolute URL for indexable routes.
 */
export function useDocumentMeta({ title, description, noindex = false, image, canonical, type = "website" } = {}) {
  useEffect(() => {
    const finalTitle = title ? (title.includes(APP_NAME) ? title : `${title} — ${APP_NAME}`) : document.title;
    if (title) document.title = finalTitle;

    if (description) {
      setMetaContent("description", description);
      setMetaContent("og:description", description, "property");
      setMetaContent("twitter:description", description);
    }
    if (title) {
      setMetaContent("og:title", finalTitle, "property");
      setMetaContent("twitter:title", finalTitle);
    }
    setMetaContent("og:type", type, "property");
    setMetaContent("robots", noindex ? "noindex, nofollow" : "index, follow");
    if (image) {
      setMetaContent("og:image", image, "property");
      setMetaContent("twitter:image", image);
    }

    const url = canonical || `${SITE_URL}${window.location.pathname}`;
    setCanonical(url);
    setMetaContent("og:url", url, "property");

    return undefined;
  }, [title, description, noindex, image, canonical, type]);
}
