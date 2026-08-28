import {z} from "zod"

export const createApiKeySchema = z.object({
  name : z
  .string()
  .trim()
  .min(2,"API key name must be at least 2 characters")
  .max(100,"API key name cannot exceed 100 Characters"),

  expiresAt : z
  .string()
  .datetime()
  .optional(),

  scopes : z
  .array(z.string().trim().min(1))
  .optional()
})
.strict();