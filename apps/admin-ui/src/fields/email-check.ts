import { z } from 'zod';

const EMAIL = z.string().email();

/**
 * The validator of an optional email column. The record form runs `validate` only, not the
 * field's format (`tasks/ui/buro-gaps.md` G14), so every `f.email` field carries this.
 */
export const checkEmail = (value: unknown): string | null =>
  value === null || value === undefined || value === '' || EMAIL.safeParse(value).success
    ? null
    : 'Enter a valid email address.';
