import type { StandardSchemaV1 } from '@burojs/core';
import { fieldImplementation } from '@burojs/react';
import { shadcnFieldImplementations } from '@burojs/ui-shadcn';
import { SANDBOX_IDENTITY_FIELD } from './sandbox-identity';
import { SandboxIdentityInput } from './sandbox-identity-input';

type Meta = Readonly<Record<string, unknown>>;

const relation = shadcnFieldImplementations.relation;

/** The relation meta (checked by the kit's relation schema) plus `sandboxApplication`, the chosen application's id or nothing. */
const sandboxIdentityMeta: StandardSchemaV1<unknown, Meta> = {
  '~standard': {
    version: 1,
    vendor: 'itap',
    validate(value: unknown) {
      const checked = relation.meta?.['~standard'].validate(value);
      if (checked instanceof Promise) return checked;
      if (checked?.issues) return checked;
      const meta = value as Meta;
      const application = meta.sandboxApplication;
      if (application !== undefined && application !== null && typeof application !== 'string' && typeof application !== 'object') {
        return { issues: [{ message: 'sandboxApplication is an application id', path: ['sandboxApplication'] }] };
      }
      return { value: meta };
    },
  },
};

/** The `itap.sandbox-identity` input (the display is the kit's relation display). */
export const sandboxIdentityImplementations = {
  [SANDBOX_IDENTITY_FIELD]: fieldImplementation({
    meta: sandboxIdentityMeta,
    Input: SandboxIdentityInput,
    ...(relation.Display === undefined ? {} : { Display: relation.Display }),
  }),
};
