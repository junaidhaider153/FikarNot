export const STATUS_RANK: Record<string, number> = {
  pending_payment: 0,
  paid: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

export type TransitionCheck = {
  allowed: boolean;
  code?: string;
  message?: string;
  status?: number;
};

/**
 * Validates moving an order between statuses in the status update endpoint.
 * - A cancelled order cannot be moved back into fulfilment.
 * - An order in pending_payment can ONLY be cancelled via this endpoint;
 *   it must never move directly to paid, processing, shipped, or delivered.
 * - Editors cannot move orders backwards (e.g. processing -> paid, or shipped -> processing).
 */
export function validateStatusTransition(previousStatus: string, targetStatus: string, isCallerAdmin: boolean): TransitionCheck {
  if (previousStatus === targetStatus) {
    return { allowed: true };
  }
  if (previousStatus === "cancelled") {
    return {
      allowed: false,
      code: "INVALID_STATUS_TRANSITION",
      message: "A cancelled order cannot be moved back into fulfilment.",
      status: 409,
    };
  }
  if (previousStatus === "pending_payment" && targetStatus !== "cancelled") {
    return {
      allowed: false,
      code: "INVALID_STATUS_TRANSITION",
      message:
        "Cannot transition an order out of pending_payment directly. Orders must be confirmed via payment confirmation or cancelled.",
      status: 409,
    };
  }
  if (targetStatus !== "cancelled") {
    if (!isCallerAdmin && STATUS_RANK[targetStatus] < STATUS_RANK[previousStatus]) {
      return {
        allowed: false,
        code: "INVALID_STATUS_TRANSITION",
        message: "Only an admin can move an order back to an earlier status.",
        status: 403,
      };
    }
  }
  return { allowed: true };
}

/**
 * Validates whether an order can accept a payment proof upload.
 * - Cancelled orders are rejected (cannot upload proof for cancelled order).
 * - Only manual payment orders in pending_payment with payment_status 'pending' are accepted.
 */
export function validatePaymentProofUpload(order: { status: string; payment_method: string; payment_status: string }): TransitionCheck {
  if (order.status === "cancelled") {
    return {
      allowed: false,
      code: "ORDER_CANCELLED",
      message: "Cannot upload payment proof for a cancelled order.",
      status: 409,
    };
  }
  if (
    order.status !== "pending_payment" ||
    !["jazzcash", "easypaisa", "bank_transfer"].includes(order.payment_method) ||
    order.payment_status !== "pending"
  ) {
    return {
      allowed: false,
      code: "PAYMENT_PROOF_NOT_ALLOWED",
      message: "A payment slip is only accepted for a pending manual payment.",
      status: 409,
    };
  }
  return { allowed: true };
}

/**
 * Validates whether staff can confirm payment for an order.
 * - Only manual payment methods are allowed.
 * - Order status must be strictly 'pending_payment' (cannot confirm cancelled, processing, delivered, etc.).
 */
export function validateConfirmPayment(order: { status: string; payment_method: string }): TransitionCheck {
  if (!["jazzcash", "easypaisa", "bank_transfer"].includes(order.payment_method)) {
    return {
      allowed: false,
      code: "INVALID_MANUAL_PAYMENT",
      message: "Only manual payment orders can be confirmed here.",
      status: 400,
    };
  }
  if (order.status !== "pending_payment") {
    return {
      allowed: false,
      code: "INVALID_ORDER_STATUS",
      message: `Cannot confirm payment for order with status "${order.status}". Only pending_payment orders can be confirmed.`,
      status: 409,
    };
  }
  return { allowed: true };
}
