export const getProductReviews = (reviews, productId) =>
  reviews.filter((review) => review.productId === productId && review.status === "published").sort((a, b) => b.createdAt - a.createdAt);

export const getProductReviewSummary = (reviews, productId, fallbackRating = 0) => {
  const items = getProductReviews(reviews, productId);
  if (!items.length) return { average: fallbackRating, count: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
  const average = +(items.reduce((sum, item) => sum + item.rating, 0) / items.length).toFixed(1);
  const distribution = items.reduce(
    (acc, item) => {
      acc[item.rating] = (acc[item.rating] || 0) + 1;
      return acc;
    },
    { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  );
  return { average, count: items.length, distribution };
};
