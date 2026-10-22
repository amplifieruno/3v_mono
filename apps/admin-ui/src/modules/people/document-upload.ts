import { type FlowConfig, defineMutation } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';
import { NAV_ICONS } from '../../app/nav';
import { hasuraOperation, rootOf } from '../../data/operations';
import { PROFILE_DOCUMENT_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { enumField } from '../../enums/field';
import { DOCUMENT_KINDS, DOCUMENT_KIND_ENUM } from '../../enums/people-records';
import { inlineFile, inlineFileValue } from '../../fields/inline-file';
import { PEOPLE_BINDING } from './profile-activity';

/** Largest document the action accepts, decoded (`MAX_DOCUMENT_BYTES` in the backend). */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** The formats the action accepts (`DOCUMENT_MIME_TYPES` in the backend), as HTML `accept` tokens. */
export const DOCUMENT_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';

export const uploadProfileDocumentInput = z.object({
  profileId: z.string().uuid(),
  kind: z.enum(DOCUMENT_KINDS),
  title: z.string().trim().min(1).max(200),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  contentBase64: z.string().min(1),
});

export const uploadProfileDocumentOutput = z.object({ document_id: z.string(), file_id: z.string() });

/** The `upload_profile_document` action (`org_admin`): the file travels inside the input as base64. */
export const uploadProfileDocumentOperation = hasuraOperation(PEOPLE_BINDING, 'uploadProfileDocument', {
  kind: 'mutation',
  document: `mutation UploadProfileDocument(
  $profile: uuid!
  $kind: String!
  $title: String!
  $fileName: String!
  $mimeType: String!
  $content: String!
) {
  upload_profile_document(
    profile_id: $profile
    kind: $kind
    title: $title
    file_name: $fileName
    mime_type: $mimeType
    content_base64: $content
  ) {
    document_id
    file_id
  }
}`,
  variables: (input) => {
    const v = input as z.infer<typeof uploadProfileDocumentInput>;
    return {
      profile: v.profileId,
      kind: v.kind,
      title: v.title,
      fileName: v.fileName,
      mimeType: v.mimeType,
      content: v.contentBase64,
    };
  },
  mapResult: (data) => rootOf(data, 'upload_profile_document'),
});

/**
 * Stores a profile document (action `upload_profile_document`): the backend puts the file in the
 * organization's storage as a sensitive file and records the document as the caller. The action
 * refuses other formats, files over 10 MB and a profile of another organization.
 */
export const uploadProfileDocument = defineMutation('itap:upload-profile-document', {
  binding: uploadProfileDocumentOperation.binding,
  input: schema(uploadProfileDocumentInput),
  output: schema(uploadProfileDocumentOutput),
  effects: [{ resource: PROFILE_DOCUMENT_RESOURCE }],
});

/** The form of {@link uploadDocumentFlow}. */
const uploadDocumentFields = {
  kind: enumField(DOCUMENT_KINDS, DOCUMENT_KIND_ENUM, {
    required: true,
    default: 'other',
    texts: { label: 'Kind', doc: { summary: 'What the document is: identity card, contract, NDA, badge photo or other.' } },
  }),
  title: f.string({
    required: true,
    max: 200,
    texts: { label: 'Title', doc: { summary: 'How the document is listed on the profile, such as "Passport 2031".' } },
  }),
  file: inlineFile({
    accept: DOCUMENT_ACCEPT,
    maxSize: DOCUMENT_MAX_BYTES,
    texts: {
      label: 'File',
      doc: {
        summary:
          'A PDF, PNG, JPEG or WebP file up to 10 MB. It is sent with the request and stored by the platform as a sensitive file; it is not kept in a draft.',
      },
    },
  }),
};

/** The action's input from the form and the profile. */
function uploadInput({
  values,
  record,
}: {
  readonly values: Readonly<Record<string, unknown>>;
  readonly record?: Readonly<Record<string, unknown>> | undefined;
}): z.input<typeof uploadProfileDocumentInput> {
  const file = inlineFileValue.parse(values.file);
  return {
    profileId: String(record?.id ?? ''),
    kind: values.kind as (typeof DOCUMENT_KINDS)[number],
    title: String(values.title ?? '').trim(),
    fileName: file.file_name,
    mimeType: file.mime_type,
    contentBase64: file.content_base64,
  };
}

/**
 * The profile's "Upload document": kind, title and a file, sent in one request to the action,
 * which stores the file. Disabled on an erased profile (`./profile-rules.ts`); not resent
 * automatically (a second send stores a second copy).
 */
export const uploadDocumentFlow = {
  texts: {
    label: 'Upload document',
    notify: 'Document uploaded.',
    doc: {
      summary:
        'Attaches a document (identity card, contract, NDA, badge photo) to the profile. The file is stored as sensitive: it is opened only from the console, and each opening is audited.',
    },
  },
  icon: NAV_ICONS.uploadDocument,
  surfaces: { default: false, show: 'menu' },
  form: {
    fields: uploadDocumentFields,
    // A flow form starts from `initial`, not from the fields' defaults.
    initial: { kind: { kind: 'literal', value: 'other' } },
  },
  submit: { mutation: uploadProfileDocument, retry: 'never', input: uploadInput },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof uploadDocumentFields>;
