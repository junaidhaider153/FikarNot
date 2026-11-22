import { assertEquals } from "@std/assert";
import {
  STATUS_RANK,
  validateConfirmPayment,
  validatePaymentProofUpload,
  validateStatusTransition,
} from "../_shared/orderLifecycle.ts";

Deno.test("orderLifecycle: STATUS_RANK gives paid and processing distinct ranks", () => {
  assertEquals(STATUS_RANK.pending_payment, 0);
  assertEquals(STATUS_RANK.paid, 1);
  assertEquals(STATUS_RANK.processing, 2);
  assertEquals(STATUS_RANK.shipped, 3);
  assertEquals(STATUS_RANK.delivered, 4);

  // Distinct ranks ensure editors cannot flip backwards between processing and paid
  assertEquals(STATUS_RANK.paid < STATUS_RANK.processing, true);
});

Deno.test("orderLifecycle: validateStatusTransition blocks reviving cancelled orders", () => {
  for (const target of ["pending_payment", "paid", "processing", "shipped", "delivered"]) {
    const res = validateStatusTransition("cancelled", target, true);
    assertEquals(res.allowed, false);
    assertEquals(res.code, "INVALID_STATUS_TRANSITION");
    assertEquals(res.status, 409);
  }
});

Deno.test("orderLifecycle: validateStatusTransition blocks moving out of pending_payment directly", () => {
  for (const target of ["paid", "processing", "shipped", "delivered"]) {
    const res = validateStatusTransition("pending_payment", target, true);
    assertEquals(res.allowed, false);
    assertEquals(res.code, "INVALID_STATUS_TRANSITION");
    assertEquals(res.status, 409);
  }

  // Only cancellation is permitted directly through this endpoint
  const cancelRes = validateStatusTransition("pending_payment", "cancelled", false);
  assertEquals(cancelRes.allowed, true);
});

Deno.test("orderLifecycle: validateStatusTransition enforces forward-only progression for editors", () => {
  // Editor moving forward: allowed
  assertEquals(validateStatusTransition("paid", "processing", false).allowed, true);
  assertEquals(validateStatusTransition("processing", "shipped", false).allowed, true);
  assertEquals(validateStatusTransition("shipped", "delivered", false).allowed, true);

  // Editor moving backward (processing -> paid, shipped -> processing): blocked with 403
  const backToPaid = validateStatusTransition("processing", "paid", false);
  assertEquals(backToPaid.allowed, false);
  assertEquals(backToPaid.status, 403);
  assertEquals(backToPaid.code, "INVALID_STATUS_TRANSITION");

  const backToProc = validateStatusTransition("shipped", "processing", false);
  assertEquals(backToProc.allowed, false);
  assertEquals(backToProc.status, 403);

  // Admin moving backward: allowed
  assertEquals(validateStatusTransition("processing", "paid", true).allowed, true);
  assertEquals(validateStatusTransition("shipped", "processing", true).allowed, true);
});

Deno.test("orderLifecycle: validatePaymentProofUpload rejects cancelled orders and non-pending manual orders", () => {
  // Cancelled order is explicitly rejected with ORDER_CANCELLED
  const cancelledOrder = {
    status: "cancelled",
    payment_method: "jazzcash",
    payment_status: "pending",
  };
  const resCancelled = validatePaymentProofUpload(cancelledOrder);
  assertEquals(resCancelled.allowed, false);
  assertEquals(resCancelled.code, "ORDER_CANCELLED");
  assertEquals(resCancelled.status, 409);

  // Non-pending_payment order is rejected
  const processingOrder = {
    status: "processing",
    payment_method: "easypaisa",
    payment_status: "pending",
  };
  const resProcessing = validatePaymentProofUpload(processingOrder);
  assertEquals(resProcessing.allowed, false);
  assertEquals(resProcessing.code, "PAYMENT_PROOF_NOT_ALLOWED");

  // Non-manual order is rejected
  const codOrder = {
    status: "pending_payment",
    payment_method: "cod",
    payment_status: "pending",
  };
  assertEquals(validatePaymentProofUpload(codOrder).allowed, false);

  // Valid manual pending_payment order is allowed
  const validOrder = {
    status: "pending_payment",
    payment_method: "bank_transfer",
    payment_status: "pending",
  };
  assertEquals(validatePaymentProofUpload(validOrder).allowed, true);
});

Deno.test("orderLifecycle: validateConfirmPayment strictly requires pending_payment status", () => {
  // Cancelled order cannot be confirmed (prevents reviving cancelled orders)
  const cancelledOrder = { status: "cancelled", payment_method: "bank_transfer" };
  const resCancelled = validateConfirmPayment(cancelledOrder);
  assertEquals(resCancelled.allowed, false);
  assertEquals(resCancelled.code, "INVALID_ORDER_STATUS");
  assertEquals(resCancelled.status, 409);

  // Already confirmed/processing order cannot be confirmed again
  const procOrder = { status: "processing", payment_method: "jazzcash" };
  const resProc = validateConfirmPayment(procOrder);
  assertEquals(resProc.allowed, false);
  assertEquals(resProc.code, "INVALID_ORDER_STATUS");

  // Delivered order cannot be confirmed
  const delOrder = { status: "delivered", payment_method: "easypaisa" };
  assertEquals(validateConfirmPayment(delOrder).allowed, false);

  // Non-manual payment method cannot be confirmed via this endpoint
  const codOrder = { status: "pending_payment", payment_method: "cod" };
  const resCod = validateConfirmPayment(codOrder);
  assertEquals(resCod.allowed, false);
  assertEquals(resCod.code, "INVALID_MANUAL_PAYMENT");
  assertEquals(resCod.status, 400);

  // Valid pending_payment order is allowed
  const valid = { status: "pending_payment", payment_method: "jazzcash" };
  assertEquals(validateConfirmPayment(valid).allowed, true);
});
