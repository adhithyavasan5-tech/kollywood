import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

import { createLovableAiGatewayRunIdFetch } from "./ai-run-id.server.ts";

export type MotionLevel = "full" | "gentle" | "reduced";
export type MotionPriority = "comfort" | "performance" | "cinema";

export async function createMotionGuide(level: MotionLevel, priority: MotionPriority) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Motion guide is not configured yet.");

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system:
      "You explain accessibility settings in plain, reassuring language. Never use technical jargon. Give exactly 2 short sentences and no heading.",
    prompt: `Explain whether the ${level} motion setting is a good match for a player who prioritizes ${priority}. Mention what visibly changes in Kollywood Clash and that they can change it anytime.`,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const text = (await result.text).trim();
  if (!text) throw new Error("The motion guide did not return an explanation.");
  return text;
}
