export function resolveRecentlyViewed(ids, products, limit = 8) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const result = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const product = byId.get(id);
    if (!product || result.some((item) => item.id === product.id)) continue;
    result.push(product);
    if (result.length >= limit) break;
  }
  return result;
}

export function scoreRecommendation(product, current) {
  if (!product || !current || product.id === current.id) return -Infinity;
  let score = 0;
  if (product.categoryId === current.categoryId) score += 60;
  const tags = new Set(current.tags || []);
  for (const tag of product.tags || []) if (tags.has(tag)) score += 12;
  if (product.featured) score += 8;
  score += Math.round(Number(product.rating || 0) * 2);
  const priceGap = Math.abs(Number(product.price || 0) - Number(current.price || 0));
  if (priceGap === 0) score += 8;
  else if (priceGap <= Math.max(25, Number(current.price || 0) * 0.2)) score += 5;
  return score;
}

export function getRecommendations(products, current, limit = 4) {
  return [...products]
    .filter((product) => product.id !== current?.id)
    .map((product) => ({ product, score: scoreRecommendation(product, current) }))
    .sort((a, b) => b.score - a.score || Number(b.product.rating || 0) - Number(a.product.rating || 0))
    .slice(0, limit)
    .map(({ product }) => product);
}
