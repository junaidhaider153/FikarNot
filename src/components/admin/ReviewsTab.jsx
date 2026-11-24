import { useApp, appActions } from "../../store/appStore";
import { Ic } from "../icons";
import { Empty, Stars } from "../common";

export function ReviewsTab() {
  const s = useApp();
  const reviews = (s.reviews || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <div className="sec-hd">
        <div>
          <p className="eyebrow">Customer voice</p>
          <h2 className="sec-title display">Reviews</h2>
        </div>
      </div>
      {!reviews.length ? (
        <Empty icon="star" title="No reviews yet" sub="Customer reviews will appear here after purchases." />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th>Customer</th>
                <th>Rating</th>
                <th>Review</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((review) => {
                const product = s.products.find((p) => p.id === review.productId);
                return (
                  <tr key={review.id}>
                    <td>
                      <strong>{product?.name || review.productId}</strong>
                    </td>
                    <td>
                      <div>{review.authorName}</div>
                      <div className="field-hint">{review.verifiedPurchase ? "Verified purchase" : "Customer"}</div>
                    </td>
                    <td>
                      <Stars v={review.rating} size={13} />
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      <strong>{review.title}</strong>
                      <div className="field-hint">{review.body}</div>
                    </td>
                    <td>{new Date(review.createdAt).toLocaleDateString()}</td>
                    <td>
                      {review.status === "hidden" ? (
                        <span className="role-badge editor" style={{ marginRight: 8 }}>
                          Hidden
                        </span>
                      ) : null}
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ marginRight: 8 }}
                        onClick={() => appActions.setReviewStatus(review.id, review.status === "hidden" ? "published" : "hidden")}
                      >
                        {review.status === "hidden" ? "Restore" : "Hide"}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          if (window.confirm("Remove this review?")) appActions.deleteReview(review.id);
                        }}
                      >
                        <Ic n="trash" s={13} /> Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
