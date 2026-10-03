import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  level: z.enum(["full", "gentle", "reduced"]),
  priority: z.enum(["comfort", "performance", "cinema"]),
});

export const explainMotionOptions = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { createMotionGuide } = await import("./motion-guide.server.ts");
    try {
      return { explanation: await createMotionGuide(data.level, data.priority) };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Motion guidance is unavailable right now.";
      throw new Error(message);
    }
  });
