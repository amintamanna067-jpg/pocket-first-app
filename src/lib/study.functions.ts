import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { StudyPayload } from "./study-types";

const lessonInput = z.object({
  title: z.string().min(1).max(180),
  sourceText: z.string().min(20).max(120000),
});

const conceptInput = z.object({
  topicId: z.string().uuid(),
  conceptKey: z.string().min(1),
  action: z.enum(["explain", "example"]),
});

const GEMINI_MODEL = "gemini-3.5-flash-lite";

type JsonSchema = Record<string, unknown>;

const lessonSchema: JsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          anchor: { type: "string" },
          explanation: { type: "string" },
          example: { type: "string" },
          recallQuestion: { type: "string" },
        },
        required: ["title", "anchor", "explanation", "example", "recallQuestion"],
      },
    },
    flashcards: {
      type: "array",
      items: {
        type: "object",
        properties: { front: { type: "string" }, back: { type: "string" } },
        required: ["front", "back"],
      },
    },
  },
  required: ["summary", "concepts", "flashcards"],
};

const conceptSchema: JsonSchema = {
  type: "object",
  properties: {
    anchor: { type: "string" },
    explanation: { type: "string" },
    example: { type: "string" },
  },
  required: ["anchor", "explanation", "example"],
};

async function callStructuredAi(prompt: string, schema: JsonSchema) {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("Gemini is not configured for this app. Add the GEMINI_API_KEY secret.");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    },
  );
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Gemini request failed (${response.status}).`);
  }
  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const output = result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!output) throw new Error("Gemini completed without usable study content.");
  return JSON.parse(output) as unknown;
}

function normalizePayload(value: unknown): StudyPayload {
  const parsed = z.object({
    summary: z.string(),
    concepts: z.array(z.object({
      title: z.string(), anchor: z.string(), explanation: z.string(), example: z.string(), recallQuestion: z.string(),
    })),
    flashcards: z.array(z.object({ front: z.string(), back: z.string() })),
  }).parse(value);
  if (parsed.concepts.length === 0) throw new Error("No concepts were generated.");
  return {
    summary: parsed.summary,
    concepts: parsed.concepts.map((concept, index) => ({ ...concept, key: `concept-${index + 1}` })),
    flashcards: parsed.flashcards.slice(0, 5).map((card, index) => ({ ...card, key: `card-${index + 1}` })),
  };
}

export const generateStudyMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => lessonInput.parse(input))
  .handler(async ({ data }) => {
    const prompt = `Return JSON for a study lesson titled "${data.title}". The JSON must have summary (string), concepts (array of individual sub-topics with title, anchor, explanation, one real-life example, recallQuestion), and flashcards (array with front and back). For each concept, first identify the single most essential sentence or short passage from the source material—the core definition or key example—and return it as anchor. Build that concept's explanation from that anchor point only, not from the full surrounding paragraph. If the source has multiple numbered sub-points under a heading (for example, "1. Technological Advancements" and "2. Market Competition"), return every numbered sub-point as its own separate concept; never merge them into one concept. Use very simple, everyday language, short sentences, no jargon. If a technical term is unavoidable, define it in plain words immediately after. Generate 3 to 5 flashcards. Do not rewrite the source as one long summary. Source:\n\n${data.sourceText}`;
    return normalizePayload(await callStructuredAi(prompt, lessonSchema));
  });

export const regenerateConcept = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => conceptInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: topic, error } = await context.supabase
      .from("topics").select("generated_payload,title,source_text").eq("id", data.topicId).single();
    if (error || !topic) throw new Error("Topic not found.");
    const payload = topic.generated_payload as unknown as StudyPayload;
    const concept = payload.concepts.find((item) => item.key === data.conceptKey);
    if (!concept) throw new Error("Concept not found.");
    const request = data.action === "explain"
      ? "Choose a different essential anchor sentence, short passage, or angle from the source material instead of merely rewording the same explanation. Build the new explanation from that new anchor only. Keep the example unchanged."
      : "Keep the anchor and explanation unchanged. Replace only the real-life example with a different concrete example.";
    const result = z.object({ anchor: z.string(), explanation: z.string(), example: z.string() }).parse(await callStructuredAi(
      `Return JSON with anchor, explanation, and example. Lesson: ${topic.title}. Concept: ${concept.title}. Current anchor: ${concept.anchor ?? "Not previously recorded."}. Current explanation: ${concept.explanation}. Current example: ${concept.example}. ${request} Use very simple, everyday language, short sentences, no jargon. If a technical term is unavoidable, define it in plain words immediately after. Source material:\n\n${topic.source_text}`,
      conceptSchema,
    ));
    const updated: StudyPayload = {
      ...payload,
      concepts: payload.concepts.map((item) => item.key === concept.key ? { ...item, ...result } : item),
    };
    const { error: updateError } = await context.supabase.from("topics")
      .update({ generated_payload: updated }).eq("id", data.topicId);
    if (updateError) throw updateError;
    return updated;
  });