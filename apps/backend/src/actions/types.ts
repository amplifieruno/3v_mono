import { z } from 'zod';
import type { Env } from '../config/env.js';
import type { HasuraClient, HasuraSession } from '../hasura/client.js';

export type ActionPayload<I> = {
  action: { name: string };
  input: I;
  session_variables: Record<string, string>;
};

export type ActionContext<I> = {
  env: Env;
  input: I;
  session: HasuraSession;
  /** Admin-secret client without a session: bypasses permissions. */
  admin: HasuraClient;
  /** Admin-secret client carrying the caller's role/user/org: Hasura permissions apply. */
  asCaller: HasuraClient;
};

export type ActionHandler<I, O> = (ctx: ActionContext<I>) => Promise<O>;

/** Business error returned to the caller as HTTP 400 `{ message, extensions: { code } }`. */
export class ActionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ActionError';
    this.code = code;
  }
}

/** Wraps a handler so its input is validated with `schema`; invalid input → ActionError('invalid_input'). */
export function defineAction<S extends z.ZodTypeAny, O>(
  schema: S,
  handler: ActionHandler<z.output<S>, O>,
): ActionHandler<unknown, O> {
  return async (ctx) => {
    const parsed = schema.safeParse(ctx.input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ActionError('invalid_input', `${issue.path.join('.') || 'input'}: ${issue.message}`);
    }
    return handler({ ...ctx, input: parsed.data });
  };
}
