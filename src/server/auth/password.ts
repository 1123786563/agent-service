import argon2 from "argon2";
import { z } from "zod";

const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function validatePassword(password: string): string {
  return passwordSchema.parse(password);
}
