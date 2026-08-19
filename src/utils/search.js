export function relevance(product, query) {
  const text = query.toLowerCase().trim();
  if (!text) return 0;

  const name = String(product.name || "").toLowerCase();
  const description = String(product.description || "").toLowerCase();
  const tags = (product.tags || []).join(" ").toLowerCase();

  let score = 0;
  if (name === text) score += 140;
  if (name.startsWith(text)) score += 90;
  if (name.includes(text)) score += 65;
  if (tags.includes(text)) score += 35;
  if (description.includes(text)) score += 15;

  const tokens = text.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (name.includes(token)) score += 20;
    if (tags.includes(token)) score += 10;
    if (description.includes(token)) score += 4;
  }

  return score;
}

export function searchProducts(products, query) {
  const text = query.trim();
  if (!text) return products;

  return products
    .map((product) => ({ product, score: relevance(product, text) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product);
}
