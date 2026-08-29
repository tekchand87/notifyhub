import {z} from "zod"

import {EVENT_CHANNELS_VALUES} from "./event.constants.js"

export const createEventSchema = z.object({
  type : z
  .string()
  .trim()
  .min(1,"Event Type is required")
  .max(100,"Event Type cannot exceed 100 characters"),

  channel : z
  .enum(EVENT_CHANNELS_VALUES,{message : "Channel must be email or webhook"}),

  payload : z
  .record(z.string(),z.unknown())
})
.strict();