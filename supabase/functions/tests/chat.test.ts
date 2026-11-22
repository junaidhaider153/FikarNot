import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { buildSystemInstruction, callGemini } from "../_shared/gemini.ts";

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
