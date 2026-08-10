import { z } from "zod";

export const AutoApplySchema = z.object({
  url: z.string(),
  submit: z.boolean().default(false),
  minMatch: z.number().default(70),
});
