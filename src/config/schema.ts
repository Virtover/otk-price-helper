import { z } from 'zod';
import type { Config } from '../core/types';

export const CURRENT_SCHEMA_VERSION = 2;

const int = z.number().int();

/** Customer type or month type: id, name in both languages, discount. */
const labelled = z
  .object({
    id: z.string().min(1).max(64),
    label: z.object({ pl: z.string().max(100), en: z.string().max(100) }).strict(),
    discountBp: int,
  })
  .strict();

/**
 * Structural schema only — ranges and ordering rules are checked by
 * core/validate so the user sees them as fixable field errors, not a rejected file.
 */
export const configSchema = z
  .object({
    schemaVersion: z.literal(2),
    handling: z.object({ percentBp: int, fixedGr: int }).strict(),
    minProfit: z.object({ percentBp: int, fixedGr: int }).strict(),
    vatBp: int,
    packages: z.array(z.object({ qty: int, discountBp: int }).strict()).max(50),
    customers: z.array(labelled).max(50),
    months: z.array(labelled).max(24),
    sale: z.object({ factorBp: int }).strict(),
    calendar: z.array(z.string().min(1).max(64)).length(12),
    ui: z.object({ discountInput: z.enum(['percent', 'multiplier']) }).strict(),
  })
  .strict();

// Compile-time check that the schema and the Config type agree.
type SchemaConfig = z.infer<typeof configSchema>;
const _check: [SchemaConfig extends Config ? true : false, Config extends SchemaConfig ? true : false] = [true, true];
void _check;
