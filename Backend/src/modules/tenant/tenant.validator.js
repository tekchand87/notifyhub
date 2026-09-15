import {z} from "zod"
import {USER_ROLES} from "../auth/auth.contants.js"

const optionalText = (maxLength,filedName )=>
  z
  .string()
  .trim()
  .max(maxLength,`${filedName} cannot exceed ${maxLength} characters`);

export const updateTenantSchema = z
.object({
  name : z
    .string()
    .trim()
    .min(2,"Tenant name must be atleast 2 characters")
    .max(100,"Tenant name cannot exceed 100 characters")
    .optional(),

    description : optionalText(500,"Description").optional(),

    website : z
      .string()
      .trim()
      .url("Website must be valid URL")
      .max(2048,"website cannot exceed the 2048 characters")
      .optional(),
})
.strict()
.refine(
  (data) => Object.keys(data).length >0,
  "At least one field must be provided"
);


export const updateWebhookConfigSchema = z.object({
  // Allow https:// and http:// (http allowed for local dev with WEBHOOK_ALLOW_LOCALHOST=true)
  webhookUrl : z
    .string()
    .trim()
    .url("webhookUrl must be a valid URL")
    .max(2048, "webhookUrl cannot exceed 2048 characters")
    .nullable()
    .optional(),
  // Secret is user-provided; system auto-generates if omitted on first save
  webhookSecret : z
    .string()
    .trim()
    .min(16, "webhookSecret must be at least 16 characters")
    .max(512, "webhookSecret cannot exceed 512 characters")
    .nullable()
    .optional(),
}).strict().refine(
  (data) => Object.keys(data).length > 0,
  "At least one field must be provided"
);


export const updateMemberSchema = z
.object({
  role : z
          .enum([USER_ROLES.TENANT_ADMIN,USER_ROLES.MEMBER])
          .optional(),
  isActive : z.boolean().optional()
})
.strict()
.refine(
  (data) => Object.keys(data).length > 0,
  "At least one field must be provided"
);

export const addMemberSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name cannot exceed 100 characters"),
  email: z.string().trim().email("Must be a valid email address").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password too long"),
  role: z.enum([USER_ROLES.TENANT_ADMIN, USER_ROLES.MEMBER]).optional(),
}).strict();
