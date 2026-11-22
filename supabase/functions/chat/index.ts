// AI Shopping Assistant Edge Function powered by the Gemini REST API over HTTPS.
// Stateless server-side: grounds responses with store catalog, categories, and policies.
import { corsHeaders } from "../_shared/cors.ts";
import { json } from "../_shared/http.ts";
import { limit } from "../_shared/rateLimit.ts";
import { admin } from "../_shared/supabase.ts";
import { validateJson, z } from "../_shared/validate.ts";
import { buildSystemInstruction, callGemini } from "../_shared/gemini.ts";

const chatSchema = z.object({
  message: z.string().trim().min(1, "Message can't be empty.").max(1200, "Please keep messages under 1200 characters."),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "model"]).transform((r) => (r === "assistant" ? "model" : r)),
        text: z.string().trim().max(1200).optional().default(""),
      }),
    )
    .optional()
    .default([]),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });

  if (req.method !== "POST") {
    return json(req, { error: "METHOD_NOT_ALLOWED", message: "Only POST is supported." }, 405);
  }

  // Rate limit: 12 messages per minute per IP
  const limited = await limit(req, "chat", 12, 60);
  if (limited) return limited;

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json(
      req,
      {
        error: "CHAT_NOT_CONFIGURED",
        message: "The chat assistant isn't set up yet. Try WhatsApp instead.",
      },
      503,
    );
  }

  const val = await validateJson(req, chatSchema, 20 * 1024);
  if (!val.success) return val.response;

  const { message, history: rawHistory } = val.data;
  const history = rawHistory.filter((t) => t.text.length > 0).slice(-10);

  try {
    const [settingsRes, categoriesRes, productsRes] = await Promise.all([
      admin.from("site_settings").select("key, value"),
      admin.from("categories").select("name").order("name"),
      admin
        .from("products")
        .select("name, price, stock, categories(name)")
        .eq("status", "published")
        .order("featured", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(40),
    ]);

    const settings: Record<string, string> = {};
    for (const row of settingsRes.data || []) settings[row.key] = String(row.value ?? "");
    // deno-lint-ignore no-explicit-any
    const categories = (categoriesRes.data || []).map((c: any) => c.name);
    const products = productsRes.data || [];

    const systemInstruction = buildSystemInstruction(settings, categories, products);
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    const reply = await callGemini(apiKey, model, systemInstruction, history, message);
    return json(req, { reply });
    // deno-lint-ignore no-explicit-any
  } catch (err: any) {
    console.error("[chat] assistant error:", err?.message || err);
    const status = err?.status === 429 ? 429 : 502;
    return json(
      req,
      {
        error: err?.code || "CHAT_FAILED",
        message:
          status === 429
            ? "The assistant is a bit busy right now — please try again shortly."
            : "Couldn't reach the chat assistant. Please try again.",
      },
      status,
    );
  }
});
