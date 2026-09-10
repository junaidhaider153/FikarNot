// Thin wrapper around the Gemini REST API. A plain fetch call is used
// instead of pulling in @google/genai — same philosophy as lib/email.js,
// which reaches Gmail over its REST API directly rather than via an SMTP
// client library: one HTTPS call in, one JSON response out, no SDK needed.
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
// gemini-3.1-flash-lite: stable (not preview), free-tier eligible, and has
// no scheduled shutdown date as of this writing — unlike gemini-2.5-flash,
// which Google has scheduled for retirement on 16 Oct 2026. Swap this
// constant if Google's lineup moves on again.
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || "gemini-3.1-flash-lite").trim();
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const geminiConfigured = Boolean(GEMINI_API_KEY);

/**
 * @param {string} systemInstruction - Grounding/brand/behavior instructions.
 * @param {{role: "user"|"model", text: string}[]} turns - Conversation so far, oldest first.
 * @returns {Promise<string>} The assistant's reply text.
 */
async function askGemini(systemInstruction, turns) {
  if (!geminiConfigured) {
    const error = new Error("Chat assistant is not configured.");
    error.code = "CHAT_NOT_CONFIGURED";
    throw error;
  }
  const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
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
    error.code = "CHAT_UPSTREAM_ERROR";
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) {
    // finishReason MAX_TOKENS/SAFETY/etc with no text — treat as a soft failure
    // the caller can turn into a friendly fallback message rather than a 500.
    const error = new Error(`Gemini returned no usable text (finishReason: ${candidate?.finishReason || "unknown"}).`);
    error.code = "CHAT_EMPTY_RESPONSE";
    throw error;
  }
  return text;
}

export { askGemini, geminiConfigured, GEMINI_MODEL };
