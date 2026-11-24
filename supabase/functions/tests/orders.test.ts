import { assertEquals } from "@std/assert";
import {
  checkoutSchema,
  extractCity,
  handleOrdersRequest,
  maskPhone,
  normalizePhone,
  orderLookupSchema,
} from "../orders/handler.ts";

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

Deno.test("orders: orderLookupSchema validates orderId and contact", () => {
  const valid = orderLookupSchema.safeParse({
    orderId: "FN-1002",
    contact: "0300 1234567",
  });
  assertEquals(valid.success, true);

  const validEmail = orderLookupSchema.safeParse({
    orderId: "FN-1002",
    contact: "customer@example.com",
  });
  assertEquals(validEmail.success, true);

  const missingId = orderLookupSchema.safeParse({
    orderId: "",
    contact: "0300 1234567",
  });
  assertEquals(missingId.success, false);

  const missingContact = orderLookupSchema.safeParse({
    orderId: "FN-1002",
    contact: "",
  });
  assertEquals(missingContact.success, false);
});

Deno.test("orders: normalizePhone, maskPhone, and extractCity helpers", () => {
  // normalizePhone
  assertEquals(normalizePhone("+92 300 1234567"), "03001234567");
  assertEquals(normalizePhone("+923001234567"), "03001234567");
  assertEquals(normalizePhone("00923001234567"), "03001234567");
  assertEquals(normalizePhone("923001234567"), "03001234567");
  assertEquals(normalizePhone("0300-1234567"), "03001234567");
  assertEquals(normalizePhone("3001234567"), "03001234567");
  assertEquals(normalizePhone(""), "");

  // maskPhone
  assertEquals(maskPhone("03001234567"), "0300****567");
  assertEquals(maskPhone("+92 321 9876543"), "0321****543");
  assertEquals(maskPhone("12345"), "****");

  // extractCity
  assertEquals(extractCity("House 12, Street 4, Sector F-7/2, Islamabad"), "Islamabad");
  assertEquals(extractCity("Gulberg III, Lahore 54000"), "Lahore");
  assertEquals(extractCity("Karachi"), "Karachi");
  assertEquals(extractCity(""), "");
});

function createMockDb(opts: {
  order?: Record<string, unknown> | null;
  items?: Record<string, unknown>[];
  rateLimitAllowed?: boolean;
}) {
  const rateLimitAllowed = opts.rateLimitAllowed !== false;
  return {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      if (fn === "rate_limit_hit") {
        return { data: rateLimitAllowed, error: null };
      }
      return { data: null, error: null };
    },
    from: (table: string) => ({
      select: (_cols?: string) => ({
        eq: (_col: string, val: unknown) => ({
          maybeSingle: async () => {
            if (table === "orders") {
              if (opts.order && opts.order.id === val) return { data: opts.order, error: null };
              return { data: null, error: null };
            }
            if (table === "order_items") {
              return { data: opts.items || [], error: null };
            }
            return { data: null, error: null };
          },
          single: async () => ({ data: opts.order ?? null, error: null }),
        }),
        in: (_col: string, _vals: unknown[]) => Promise.resolve({ data: opts.items || [], error: null }),
      }),
    }),
  };
}

const mockOrderRecord = {
  id: "FN-9001",
  customer_name: "Fatima Khan",
  customer_email: "fatima.khan@example.com",
  customer_phone: "03001234567",
  customer_address: "House 45, Street 10, Sector F-8/1, Islamabad",
  payment_method: "cod",
  payment_status: "pending",
  status: "processing",
  subtotal: 5000,
  discount: 500,
  shipping: 0,
  tax: 0,
  total: 4500,
  currency: "PKR",
  created_at: "2026-11-23T00:00:00.000Z",
  courier: "PostEx",
  tracking_number: "PEX-123456",
  tracking_url: "https://postex.pk/track/PEX-123456",
  shipment_status: "shipped",
};

Deno.test("orders: /lookup rejects partial phone suffixes", async () => {
  const db = createMockDb({ order: mockOrderRecord });
  const req = new Request("http://localhost/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderId: "FN-9001",
      contact: "1234567", // Suffix of 03001234567 — MUST BE REJECTED
    }),
  });

  const res = await handleOrdersRequest(req, { client: db });
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.error, "NOT_FOUND");
});

Deno.test("orders: /lookup succeeds with normalized exact phone matches", async () => {
  const db = createMockDb({ order: mockOrderRecord, items: [{ product_id: "p-1", product_name: "Silk Scarf", price: 4500, qty: 1 }] });
  
  // Format variants of the exact same number
  const validInputs = [
    "03001234567",
    "+923001234567",
    "+92 300 1234567",
    "00923001234567",
    "923001234567",
    "0300-1234567",
  ];

  for (const contact of validInputs) {
    const req = new Request("http://localhost/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orderId: "FN-9001",
        contact,
      }),
    });

    const res = await handleOrdersRequest(req, { client: db });
    assertEquals(res.status, 200, `Expected 200 for contact format: ${contact}`);
    const data = await res.json();
    assertEquals(data.order.id, "FN-9001");
    assertEquals(data.order.status, "processing");
    assertEquals(data.order.courier, "PostEx");
    assertEquals(data.order.tracking, "PEX-123456");
    assertEquals(data.order.city, "Islamabad");
    assertEquals(data.order.maskedPhone, "0300****567");

    // CRITICAL: Strip sensitive PII
    assertEquals((data.order as Record<string, unknown>).customer, undefined);
    assertEquals((data.order as Record<string, unknown>).customer_name, undefined);
    assertEquals((data.order as Record<string, unknown>).customer_email, undefined);
    assertEquals((data.order as Record<string, unknown>).customer_address, undefined);
  }
});

Deno.test("orders: /lookup succeeds with case-insensitive exact email match", async () => {
  const db = createMockDb({ order: mockOrderRecord });
  const req = new Request("http://localhost/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderId: "FN-9001",
      contact: "Fatima.Khan@Example.COM",
    }),
  });

  const res = await handleOrdersRequest(req, { client: db });
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.order.id, "FN-9001");
  assertEquals(data.order.city, "Islamabad");
  assertEquals(data.order.maskedPhone, "0300****567");
  assertEquals((data.order as Record<string, unknown>).customer, undefined);
});

Deno.test("orders: /lookup triggers 429 when rate limit is exceeded per order", async () => {
  const db = createMockDb({ order: mockOrderRecord, rateLimitAllowed: false });
  const req = new Request("http://localhost/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderId: "FN-9001",
      contact: "03001234567",
    }),
  });

  const res = await handleOrdersRequest(req, { client: db });
  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.error, "RATE_LIMITED");
});
