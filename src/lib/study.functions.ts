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
          explanation: { type: "string" },
          example: { type: "string" },
          recallQuestion: { type: "string" },
        },
        required: ["title", "explanation", "example", "recallQuestion"],
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
  properties: { explanation: { type: "string" }, example: { type: "string" } },
  required: ["explanation", "example"],
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
      title: z.string(), explanation: z.string(), example: z.string(), recallQuestion: z.string(),
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
    const prompt = `Return JSON for a study lesson titled "${data.title}". The JSON must have summary (string), concepts (array of individual sub-topics with title, explanation in plain language, one real-life example, recallQuestion), and flashcards (array with front and back). Generate 3 to 5 flashcards. Do not rewrite the source as one long summary. Source:\n\n${data.sourceText}`;
    return normalizePayload(await callStructuredAi(prompt));
  });

export const regenerateConcept = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => conceptInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: topic, error } = await context.supabase
      .from("topics").select("generated_payload,title").eq("id", data.topicId).single();
    if (error || !topic) throw new Error("Topic not found.");
    const payload = topic.generated_payload as unknown as StudyPayload;
    const concept = payload.concepts.find((item) => item.key === data.conceptKey);
    if (!concept) throw new Error("Concept not found.");
    const request = data.action === "explain"
      ? "Rewrite only the explanation in a meaningfully different, simpler way. Keep the example and recall question unchanged."
      : "Replace only the real-life example with a different concrete example. Keep the explanation and recall question unchanged.";
    const result = z.object({ explanation: z.string(), example: z.string() }).parse(await callStructuredAi(
      `Return JSON with explanation and example. Lesson: ${topic.title}. Concept: ${concept.title}. Current explanation: ${concept.explanation}. Current example: ${concept.example}. ${request}`,
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