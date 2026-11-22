// Gemini REST API utilities and system instruction grounding for FikarNot.
export function buildSystemInstruction(
  settings: Record<string, string>,
  categories: string[],
  // deno-lint-ignore no-explicit-any
  products: any[],
): string {
  const currency = settings.currency || "PKR";
  const storeName = settings.storeName || settings.site_title || "FikarNot";
  const aboutIntro = settings.aboutIntro || "Thoughtful everyday objects, selected with intention.";
  const shippingPolicy = settings.shippingPolicy || "Standard delivery across Pakistan within 2-4 business days.";
  const returnPolicy = settings.returnPolicy || "7-day return policy for unused items in original packaging.";
  const whatsappNumber = settings.whatsappNumber || "";

  const categoryLines = categories.join(", ") || "none listed";
  const productLines = products
    // deno-lint-ignore no-explicit-any
    .map((p: any) => {
      const cat = p.categories?.name || "General";
      const inStock = (p.stock ?? 0) > 0 ? "in stock" : "out of stock";
      return `- ${p.name} (${cat}): ${currency} ${p.price}, ${inStock}`;
    })
    .join("\n");

  return [
    `You are the FikarNot store assistant — a friendly, concise shopping helper for the FikarNot e-commerce site (${storeName}).`,
    `About the store: ${aboutIntro}`,
    `Categories: ${categoryLines}.`,
    `Some current products (not the full catalogue):\n${productLines || "No products loaded."}`,
    `Shipping: ${shippingPolicy}`,
    `Returns: ${returnPolicy}`,
    `Currency is ${currency}. For anything you can't help with — order status, complaints, or something not covered here — direct the person to WhatsApp at ${whatsappNumber || "our support contact"} or suggest they check their account's Orders page.`,
    `You do not have access to any individual customer's order history, so never guess or make up order details, tracking numbers, or delivery dates.`,
    `Keep replies short (2-4 sentences unless asked for detail), warm, and honest. If you don't know something, say so rather than guessing.`,
  ].join("\n\n");
}

export async function callGemini(
  apiKey: string,
  model: string,
  systemInstruction: string,
  history: { role: string; text: string }[],
  message: string,
): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [
        ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
        { role: "user", parts: [{ text: message }] },
      ],
      generationConfig: { maxOutputTokens: 512, temperature: 0.6 },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`Gemini API error ${response.status}: ${detail.slice(0, 300)}`);
    // deno-lint-ignore no-explicit-any
    (error as any).status = response.status;
    // deno-lint-ignore no-explicit-any
    (error as any).code = "CHAT_UPSTREAM_ERROR";
    throw error;
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  // deno-lint-ignore no-explicit-any
  const text = candidate?.content?.parts
    ?.map((part: any) => part.text || "")
    .join("")
    .trim();
  if (!text) {
    const error = new Error(`Gemini returned no usable text (finishReason: ${candidate?.finishReason || "unknown"}).`);
    // deno-lint-ignore no-explicit-any
    (error as any).code = "CHAT_EMPTY_RESPONSE";
    throw error;
  }
  return text;
}
