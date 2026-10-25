
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

// Verify this model ID against the models available to your Groq account.
const MODEL = "llama-3.3-70b-versatile";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("Golden_Hour");

  if (!apiKey) {
    console.error("Missing Groq secret: Golden_Hour");
    return json({ error: "AI service is not configured" }, 500);
  }

  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON request" }, 400);
  }

  const question =
    typeof body.question === "string"
      ? body.question.trim()
      : typeof body.message === "string"
        ? body.message.trim()
        : "";

  if (!question) {
    return json({ error: "Please provide a question" }, 400);
  }

  if (question.length > 6000) {
    return json({ error: "Message is too long" }, 413);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `You are Golden Hour, a careful cybersecurity
assistant helping people understand online scams and prepare
accurate complaint drafts.

Give clear, calm, practical guidance.
Never invent facts, evidence, transaction IDs, or official actions.
Distinguish user-provided facts from suggestions.
Do not claim a complaint has been filed unless an actual
filing system confirms it.
Ask for missing information when needed.
Avoid asking users to share passwords, OTPs, PINs, or full
payment credentials.`,
          },
          {
            role: "user",
            content: question,
          },
        ],
        temperature: 0.3,
        max_completion_tokens: 700,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Keep API keys and potentially sensitive response bodies
      // out of logs and browser error messages.
      console.error("Groq HTTP status:", response.status);

      if (response.status === 429) {
        return json({
          error: "AI usage limit reached. Please try again later.",
        }, 429);
      }

      if (response.status === 401 || response.status === 403) {
        return json({
          error: "AI provider authentication failed. Check configuration.",
        }, 502);
      }

      if (response.status === 400 || response.status === 404) {
        return json({
          error: "AI request or model configuration is invalid.",
        }, 502);
      }

      return json({
        error: "AI provider is temporarily unavailable.",
      }, 502);
    }

    const result = await response.json();
    const text = result?.choices?.[0]?.message?.content;

    if (typeof text !== "string" || !text.trim()) {
      return json({ error: "The AI returned an empty response." }, 502);
    }

    return json({
      text: text.trim(),
      model: result.model ?? MODEL,
    });
  } catch (error) {
    const timedOut =
      error instanceof Error && error.name === "AbortError";

    console.error(
      timedOut ? "Groq request timed out" : "Groq request failed",
    );

    return json({
      error: timedOut
        ? "AI response timed out. Please try again."
        : "Could not reach the AI service.",
    }, timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
});
