import { useEffect } from "react";
import { APP_NAME, APP_DESCRIPTION } from "../../config/appConfig";

export function StructuredData({ data, id = "fikarnot-route-json-ld" }) {
  useEffect(() => {
    if (!data) return undefined;
    let script = document.getElementById(id);
    if (!script) {
      script = document.createElement("script");
      script.id = id;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
    return () => {
      if (script) script.remove();
    };
  }, [data, id]);

  return null;
}

export function SiteStructuredData() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://www.fikarnot.shop/#organization",
        name: APP_NAME,
        url: "https://www.fikarnot.shop/",
        description: APP_DESCRIPTION,
      },
      {
        "@type": "WebSite",
        "@id": "https://www.fikarnot.shop/#website",
        name: APP_NAME,
        url: "https://www.fikarnot.shop/",
        description: APP_DESCRIPTION,
        publisher: { "@id": "https://www.fikarnot.shop/#organization" },
        potentialAction: {
          "@type": "SearchAction",
          target: "https://www.fikarnot.shop/products?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return <StructuredData data={data} id="fikarnot-site-json-ld" />;
}
