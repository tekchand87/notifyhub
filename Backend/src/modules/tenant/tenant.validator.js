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
