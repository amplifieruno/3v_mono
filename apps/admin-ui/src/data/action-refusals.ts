import {
  type DataError,
  type DataProvider,
  defineDataProvider,
  defineMutationHandler,
  isDataError,
} from '@burojs/core';

/** One server refusal of an action: the backend's `extensions.code` and its message. */
export interface ActionRefusalError {
  readonly code: string;
  readonly message: string;
}

/** A refusal as the flow form shows it: on the input key `path[0]` (mapped to its field), or form-level. */
export interface RefusalIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

/**
 * How one action's definite refusals read: the issues for a refusal the action answers
 * before writing anything (its own codes), or `null` for any other error, which keeps the
 * provider's classification ("may have been applied").
 */
export type ActionRefusalReader = (error: ActionRefusalError, input: unknown) => readonly RefusalIssue[] | null;

/** Readers by `<binding resource>.<operation>` of the custom mutation. */
export type ActionRefusals = Readonly<Record<string, ActionRefusalReader>>;

/** The first backend code and the messages of a Hasura error envelope (`details` = its `errors`). */
function refusalOf(error: DataError): ActionRefusalError | null {
  const details = Array.isArray(error.details) ? (error.details as readonly unknown[]) : [];
  for (const entry of details) {
    const code = (entry as { readonly extensions?: { readonly code?: unknown } } | null)?.extensions?.code;
    const message = (entry as { readonly message?: unknown } | null)?.message;
    if (typeof code === 'string') return { code, message: typeof message === 'string' ? message : '' };
  }
  return null;
}

/**
 * The provider with each listed action's definite refusals turned into `validation` errors
 * carrying form issues (`tasks/ui/buro-gaps.md` G33). The Hasura provider classifies every
 * error of a custom mutation over an Action as "may have been applied" (`sent` or `protocol`),
 * because the envelope does not say whether the action ran. The ITAP backend answers a
 * business refusal (bad photos, a duplicate face, a restricted person) with HTTP 400 and its
 * own `extensions.code` before it writes anything, so a reader that knows the action's codes
 * may call it what it is: the flow then shows the refusal on the form instead of the unknown
 * screen. Codes a reader does not name, Hasura's own codes and transport failures pass through
 * unchanged.
 *
 * Scope: custom mutations only (`provider.mutations.custom`), that is Hasura Actions and tracked
 * SQL functions bound through `hasuraOperation(..., refusals)` (`./sql-refusals.ts` for the
 * functions). Resource writes (create / update / delete of a resource, flows with
 * `submit.create` / `update` / `delete`) do not pass through here: their refusals keep the
 * provider's own classification.
 */
export function withActionRefusals(provider: DataProvider, refusals: ActionRefusals): DataProvider {
  const custom = provider.mutations?.custom;
  if (custom === undefined || Object.keys(refusals).length === 0) return provider;
  const wrapped = defineMutationHandler<Parameters<typeof custom>[0], unknown>(async (descriptor, context) => {
    try {
      return await custom(descriptor, context);
    } catch (error: unknown) {
      const reader = refusals[`${descriptor.resource}.${descriptor.operation}`];
      if (reader === undefined || !isDataError(error)) throw error;
      const refusal = refusalOf(error);
      const issues = refusal === null ? null : reader(refusal, descriptor.input);
      if (refusal === null || issues === null) throw error;
      const refused: DataError = {
        kind: 'validation',
        // The reader's code: an action's own code, or the refusal a SQL function raised.
        code: issues[0]?.code ?? refusal.code,
        message: refusal.message,
        // The form resolves `message.key` first (no bundle entry: the English text stays), then `default`.
        details: {
          issues: issues.map((issue) => ({
            ...issue,
            message: { key: `validation.itap.action.${issue.code}`, default: issue.message },
            severity: 'error',
          })),
        },
      };
      throw refused;
    }
  }, custom.replay);
  return defineDataProvider({ ...provider, mutations: { ...provider.mutations, custom: wrapped } });
}
