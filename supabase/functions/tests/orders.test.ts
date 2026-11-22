import { assertEquals } from "@std/assert";
import { checkoutSchema } from "../orders/index.ts";

Deno.test("orders: checkoutSchema validates Pakistani mobile numbers", () => {
  const baseOrder = {
    customer: {
      name: "Ahmed Ali",
      email: "ahmed@example.com",
      address: "Main Boulevard, Gulberg III, Lahore",
      paymentMethod: "cod" as const,
      phone: "03001234567",
    },
    items: [{ productId: "p-1", qty: 2 }],
  };

  // Valid Pakistani mobile phone variations
  const validPhones = [
    "03001234567",
    "0300 1234567",
    "0300-1234567",
    "+923001234567",
    "+92 300 1234567",
    "923001234567",
    "00923001234567",
    "03451234567",
    "03121234567",
    "03331234567",
  ];

  for (const phone of validPhones) {
    const res = checkoutSchema.safeParse({
      ...baseOrder,
      customer: { ...baseOrder.customer, phone },
    });
    assertEquals(res.success, true, `Expected phone ${phone} to be valid`);
  }

  // Invalid phone numbers
  const invalidPhones = [
    "",
    "   ",
    "12345",
    "0211234567", // Landline / Karachi area code
    "0421234567", // Landline / Lahore area code
    "030012345", // Too short
    "030012345678", // Too long
    "+14155552671", // US number
    "abcdefghijk", // Not digits
  ];

  for (const phone of invalidPhones) {
    const res = checkoutSchema.safeParse({
      ...baseOrder,
      customer: { ...baseOrder.customer, phone },
    });
    assertEquals(res.success, false, `Expected phone ${phone} to be rejected`);
  }
});
