import { z } from "zod";

/*
  The one definition of an acceptable password, for signup and for choosing a
  new one (D193). Mirrors passwordRules in components/auth/password-strength.tsx
  exactly, so the live checklist never says fine to something refused here.
*/

/* A short deny list of the passwords that show up first in every credential
   stuffing list. Not a substitute for length, but it stops the worst choices
   at zero cost. */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd", "p@ssw0rd", "p@ssword1",
  "qwerty123", "qwertyuiop", "welcome123", "admin123", "letmein123",
  "iloveyou1", "abc123456", "123456789", "1234567890", "changeme1",
  "football1", "monkey123", "dragon123", "sunshine1", "princess1",
]);

export const newPassword = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(72, "Passwords are limited to 72 characters.")
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/[0-9]/, "Include a number.")
  .refine(
    (v) => !COMMON_PASSWORDS.has(v.toLowerCase()),
    "That password is too common. Pick something harder to guess.",
  );
