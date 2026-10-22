import { f } from '@burojs/field-types';
import { dateTime } from '../../fields/date-time';

/**
 * The read-only columns of `itap.identities`: what recognition, the consent effects and the
 * sandbox maintain. Never written by the console.
 */
export const identitySystemFields = {
  matching_enabled: f.boolean({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Matching',
      doc: {
        summary:
          'Whether cameras, search and face authentication may match this face. Off when the linked person withdrew biometric consent: no new photos can be added then, and the face templates are deleted after the consent retention period.',
      },
    },
  }),
  is_synthetic: f.boolean({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Synthetic',
      doc: {
        summary:
          'A test identity of the face authentication sandbox, fixed when it was created: never linked to a profile, never merged with a real identity and never returned by recognition or search.',
      },
    },
  }),
  age: f.number({
    system: true,
    in: ['list', 'show'],
    nullable: true,
    texts: { label: 'Age', doc: { summary: 'The estimated age from the attributes (`age`), kept for filters and segments.' } },
  }),
  confidence: f.number({
    system: true,
    in: ['show'],
    nullable: true,
    texts: {
      label: 'Confidence',
      doc: { summary: 'How confidently recognition matched this identity most recently, from 0 to 1.' },
    },
  }),
  first_seen_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'First seen', doc: { summary: 'When a camera first recorded this face.' } },
  }),
  last_seen_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Last seen', doc: { summary: 'When a camera last recorded this face.' } },
  }),
  detection_count: f.number({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Detections',
      doc: { summary: 'How many times cameras recorded this face, counted by the platform as detections arrive.' },
    },
  }),
};
