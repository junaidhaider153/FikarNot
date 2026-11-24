export const RETURN_REASONS = Object.freeze([
  "Changed my mind",
  "Wrong item received",
  "Damaged item",
  "Item not as described",
  "Quality issue",
  "Other",
]);

export const RETURN_STATUSES = Object.freeze({
  REQUESTED: "requested",
  APPROVED: "approved",
  REJECTED: "rejected",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

export function canCancelOrder(order) {
  return ["pending_payment", "paid", "processing"].includes(order?.status) && !order?.returnRequest;
}

const toTimestamp = (value, fallback = Date.now()) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

export function canRequestReturn(order, now = Date.now()) {
  if (!order || order.status !== "delivered") return false;
  if (order.returnRequest) return false;
  const reference = toTimestamp(order.deliveredAt ?? order.createdAt, now);
  const age = now - reference;
  const thirtyDays = 30 * 86400000;
  return age >= 0 && age <= thirtyDays;
}

export function normalizeReturnRequest(request) {
  const createdAt = toTimestamp(request.createdAt ?? request.created_at);
  return {
    id: String(request.id || ""),
    orderId: String(request.orderId ?? request.order_id ?? ""),
    userId: String(request.userId ?? request.user_id ?? ""),
    reason: String(request.reason || "Other"),
    note: String(request.note || "").trim(),
    status: request.status || RETURN_STATUSES.REQUESTED,
    refund: request.refund || null,
    createdAt,
    updatedAt: toTimestamp(request.updatedAt ?? request.updated_at, createdAt),
  };
}
