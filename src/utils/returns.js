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
  return ["paid", "processing"].includes(order?.status) && !order?.returnRequest;
}

export function canRequestReturn(order, now = Date.now()) {
  if (!order || order.status !== "delivered") return false;
  if (order.returnRequest) return false;
  const age = now - Number(order.createdAt || now);
  const thirtyDays = 30 * 86400000;
  return age >= 0 && age <= thirtyDays;
}

export function normalizeReturnRequest(request) {
  return {
    id: String(request.id || ""),
    orderId: String(request.orderId || ""),
    userId: String(request.userId || ""),
    reason: String(request.reason || "Other"),
    note: String(request.note || "").trim(),
    status: request.status || RETURN_STATUSES.REQUESTED,
    createdAt: Number(request.createdAt || Date.now()),
    updatedAt: Number(request.updatedAt || request.createdAt || Date.now()),
  };
}
