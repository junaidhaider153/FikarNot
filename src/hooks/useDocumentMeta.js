import { useEffect } from "react";
import { APP_NAME } from "../config/appConfig";

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

/**
 * Sets document.title and the description / Open Graph meta tags for the
 * current route. Falls back to nothing (leaves existing tags alone) for any
 * field left undefined, so pages can override only what they need.
 *
 * @param {{ title?: string, description?: string, noindex?: boolean, image?: string }} meta
 */
export function useDocumentMeta({ title, description, noindex = false, image } = {}) {
  useEffect(() => {
    if (title) document.title = title.includes(APP_NAME) ? title : `${title} — ${APP_NAME}`;
    if (description) {
      setMetaContent("description", description);
      setMetaContent("og:description", description, "property");
      setMetaContent("twitter:description", description);
    }
    if (title) {
      setMetaContent("og:title", document.title, "property");
      setMetaContent("twitter:title", document.title);
    }
    if (image) {
      setMetaContent("og:image", image, "property");
      setMetaContent("twitter:image", image);
    }
    setMetaContent("robots", noindex ? "noindex, nofollow" : "index, follow");
  }, [title, description, noindex, image]);
}
