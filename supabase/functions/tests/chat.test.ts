import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { buildSystemInstruction, callGemini } from "../_shared/gemini.ts";
import { cleanChatHistory, fetchCatalogContext, handleChatRequest } from "../chat/handler.ts";

Deno.test("chat: buildSystemInstruction constructs grounding prompt with catalog and policies", () => {
  const settings = {
    storeName: "FikarNot Premium",
    currency: "PKR",
    aboutIntro: "Curated objects for mindful living.",
    shippingPolicy: "Delivered in 2-3 business days across Pakistan.",
    returnPolicy: "Hassle-free 7-day returns.",
    whatsappNumber: "+923001234567",
  };
  const categories = ["Apparel", "Home Decor"];
  const products = [
    { name: "Linen Shirt", price: 3500, stock: 10, categories: { name: "Apparel" } },
    { name: "Ceramic Vase", price: 2200, stock: 0, categories: { name: "Home Decor" } },
  ];

  const instruction = buildSystemInstruction(settings, categories, products);

  assertStringIncludes(instruction, "FikarNot Premium");
  assertStringIncludes(instruction, "Apparel, Home Decor");
  assertStringIncludes(instruction, "- Linen Shirt (Apparel): PKR 3500, in stock");
  assertStringIncludes(instruction, "- Ceramic Vase (Home Decor): PKR 2200, out of stock");
  assertStringIncludes(instruction, "+923001234567");
  assertStringIncludes(instruction, "Delivered in 2-3 business days across Pakistan.");
  assertStringIncludes(instruction, "Hassle-free 7-day returns.");
});

Deno.test("chat: cleanChatHistory strips leading assistant/model welcome turns", () => {
  const historyWithLeadingModel = [
    { role: "model" as const, text: "Hi! Welcome to FikarNot. How can I help you today?" },
    { role: "user" as const, text: "Do you sell leather jackets?" },
    { role: "model" as const, text: "Yes, we have genuine leather jackets." },
  ];

  const cleaned = cleanChatHistory(historyWithLeadingModel);
  assertEquals(cleaned.length, 2);
  assertEquals(cleaned[0].role, "user");
  assertEquals(cleaned[0].text, "Do you sell leather jackets?");
  assertEquals(cleaned[1].role, "model");
  assertEquals(cleaned[1].text, "Yes, we have genuine leather jackets.");

  // If there are multiple model turns at the start, all are stripped
  const multipleLeading = [
    { role: "model" as const, text: "Welcome!" },
    { role: "model" as const, text: "Need assistance?" },
    { role: "user" as const, text: "What is your return policy?" },
  ];
  const cleanedMultiple = cleanChatHistory(multipleLeading);
  assertEquals(cleanedMultiple.length, 1);
  assertEquals(cleanedMultiple[0].role, "user");
  assertEquals(cleanedMultiple[0].text, "What is your return policy?");

  // If already starts with user, nothing is removed
  const userFirst = [{ role: "user" as const, text: "Hello" }];
  assertEquals(cleanChatHistory(userFirst).length, 1);
});

Deno.test("chat: fetchCatalogContext executes exact query shape without .eq('status', 'published')", async () => {
  let productsStatusEqCalled = false;
  const mockClient = {
    // deno-lint-ignore no-explicit-any
    from: (table: string): any => {
      if (table === "site_settings") {
        return {
          select: (cols: string) => {
            assertEquals(cols, "key, value");
            return Promise.resolve({ data: [{ key: "storeName", value: "FikarNot" }], error: null });
          },
        };
      }
      if (table === "categories") {
        return {
          select: (cols: string) => {
            assertEquals(cols, "name");
            return {
              order: (col: string) => {
                assertEquals(col, "name");
                return Promise.resolve({ data: [{ name: "Apparel" }], error: null });
              },
            };
          },
        };
      }
      if (table === "products") {
        return {
          select: (cols: string) => {
            assertEquals(cols, "name, price, stock, categories(name)");
            return {
              // deno-lint-ignore no-explicit-any
              eq: (_col: string, _val: any) => {
                productsStatusEqCalled = true;
                return {};
              },
              // deno-lint-ignore no-explicit-any
              order: (col1: string, opt1: any) => {
                assertEquals(col1, "featured");
                assertEquals(opt1?.ascending, false);
                return {
                  // deno-lint-ignore no-explicit-any
                  order: (col2: string, opt2: any) => {
                    assertEquals(col2, "updated_at");
                    assertEquals(opt2?.ascending, false);
                    return {
                      limit: (n: number) => {
                        assertEquals(n, 40);
                        return Promise.resolve({
                          data: [{ name: "Oxford Shirt", price: 4200, stock: 8, categories: { name: "Apparel" } }],
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const context = await fetchCatalogContext(mockClient);
  assertEquals(productsStatusEqCalled, false);
  assertEquals(context.settings.storeName, "FikarNot");
  assertEquals(context.categories, ["Apparel"]);
  assertEquals(context.products.length, 1);
  assertEquals(context.products[0].name, "Oxford Shirt");
});

Deno.test("chat: fetchCatalogContext throws explicit error when any DB query fails", async () => {
  const failingClient = {
    // deno-lint-ignore no-explicit-any
    from: (table: string): any => {
      if (table === "site_settings") {
        return { select: () => Promise.resolve({ data: [], error: null }) };
      }
      if (table === "categories") {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === "products") {
        return {
          select: () => ({
            order: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: null, error: { message: "Database connection timeout" } }),
              }),
            }),
          }),
        };
      }
    },
  };

  await assertRejects(
    async () => {
      await fetchCatalogContext(failingClient);
    },
    Error,
    "Failed to load products: Database connection timeout",
  );
});

Deno.test("chat: handleChatRequest handles request with mock DB and caller", async () => {
  const mockClient = {
    // deno-lint-ignore no-explicit-any
    from: (table: string): any => {
      if (table === "site_settings") {
        return { select: () => Promise.resolve({ data: [{ key: "storeName", value: "FikarNot" }], error: null }) };
      }
      if (table === "categories") {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [{ name: "Apparel" }], error: null }),
          }),
        };
      }
      if (table === "products") {
        return {
          select: () => ({
            order: () => ({
              order: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [{ name: "Hoodie", price: 3000, stock: 5, categories: { name: "Apparel" } }],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
    },
  };

  let receivedHistory: Array<{ role: string; text: string }> = [];
  const mockGemini = (
    _apiKey: string,
    _model: string,
    _systemInstruction: string,
    history: Array<{ role: string; text: string }>,
    _message: string,
  ) => {
    receivedHistory = history;
    return Promise.resolve("Yes, we have Hoodies in stock!");
  };

  const req = new Request("http://localhost/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Do you have hoodies?",
      history: [
        { role: "assistant", text: "Welcome to FikarNot!" },
        { role: "user", text: "Hello" },
        { role: "assistant", text: "Hi! How can I help?" },
      ],
    }),
  });

  const res = await handleChatRequest(req, {
    client: mockClient,
    callGeminiFn: mockGemini as typeof callGemini,
    apiKey: "dummy-key",
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.reply, "Yes, we have Hoodies in stock!");
  // Check that leading welcome turn was stripped
  assertEquals(receivedHistory[0].role, "user");
  assertEquals(receivedHistory[0].text, "Hello");
});

Deno.test("chat: callGemini sends structured payload and parses candidate text", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let capturedUrl = "";
    // deno-lint-ignore no-explicit-any
    let capturedBody: any = null;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "We have the Linen Shirt in stock for PKR 3,500!" }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const reply = await callGemini(
      "test-key",
      "gemini-2.5-flash",
      "System prompt",
      [{ role: "user", text: "Do you have shirts?" }],
      "Tell me more",
    );

    assertEquals(reply, "We have the Linen Shirt in stock for PKR 3,500!");
    assertStringIncludes(capturedUrl, "models/gemini-2.5-flash:generateContent?key=test-key");
    assertEquals(capturedBody.systemInstruction.parts[0].text, "System prompt");
    assertEquals(capturedBody.contents.length, 2);
    assertEquals(capturedBody.contents[0].parts[0].text, "Do you have shirts?");
    assertEquals(capturedBody.contents[1].parts[0].text, "Tell me more");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("chat: callGemini throws CHAT_UPSTREAM_ERROR on upstream error response", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      return new Response("Resource exhausted", { status: 429 });
    }) as typeof fetch;

    await assertRejects(
      async () => {
        await callGemini("test-key", "gemini-2.5-flash", "Prompt", [], "Hi");
      },
      Error,
      "Gemini API error 429",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("chat: callGemini throws CHAT_EMPTY_RESPONSE when candidates have no usable text", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          candidates: [{ finishReason: "SAFETY" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await assertRejects(
      async () => {
        await callGemini("test-key", "gemini-2.5-flash", "Prompt", [], "Hi");
      },
      Error,
      "Gemini returned no usable text",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
