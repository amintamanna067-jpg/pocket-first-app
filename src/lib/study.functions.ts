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

async function callStructuredAi(prompt: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this app.");
  const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      input: prompt,
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      text: { format: { type: "json_object" } },
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `AI request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("AI returned no response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6);
        if (raw === "[DONE]") continue;
        try {
          const data = JSON.parse(raw) as { type?: string; delta?: string };
          if (data.type === "response.output_text.delta" && data.delta) output += data.delta;
        } catch {
          // Incomplete/non-JSON SSE lines are ignored.
        }
      }
    }
  }
  if (!output) throw new Error("AI completed without usable study content.");
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