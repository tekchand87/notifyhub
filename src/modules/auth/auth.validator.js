import z from "zod"

export const registerSchema = z.object({
  name : z
    .string()
    .trim()
    .min(2,"Name must be atleast 2 characters")
    .max(100,"Name length be exceed the  100 characters"),

  email : z 
    .string()
    .trim()
    .email("Please Provide a valid email"),
  
  password : z
    .string()
    .min(8,"Password Length must be atleast 8 length")
    .max(100,"Password Length  cannot exceed the 100 characters"),

  tenantName : z
    .string()
    .trim()
    .min(2,"Tenant Name must be atleast 2 characters")
    .max(100,"Tenant Name cannot exceed the 100 characters"),
});


export const loginSchema = z.object({
  email : z
    .string()
    .trim()
    .email("Please Provide a Valid Email"),

  password : z 
    .string()
    .min(8,"Password Length must be atleast 8 length"),
});

export const changePasswordSchema = z.object({
  currentPassword : z 
    .string()
    .min(1,"CurrentPassword is required")
    .trim(),

  newPassword : z 
    .string()
    .trim()
    .min(8,"NewPassword minlength must be 8")
    .max(100,"New Password Cannot exceed 100 Characters")
});
