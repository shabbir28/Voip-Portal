import { z } from 'zod';
import { createHash } from 'node:crypto';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const text = z.string().trim().min(1).max(100);
export const email = z.string().trim().toLowerCase().email().max(254);
export const id = z.coerce.number().int().positive();
export const time = z.string().regex(/^(?:[01]\d|2[0-3]):(?:00|30)$/);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !isNaN(d) && d.toISOString().slice(0, 10) === v;
  }, 'Choose a valid date');
