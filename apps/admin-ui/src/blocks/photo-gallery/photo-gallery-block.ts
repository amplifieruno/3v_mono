import { absent, defineBlock, prop, source } from '@burojs/core';
import { z } from 'zod';
import { identityPhotos } from './identity-photos-query';

/**
 * The face photos of an identity (`itap:photo-gallery`): a grid of crops, newest first, each with
 * its kind (camera capture, enrollment, uploaded), the quality the platform scored, when it was
 * taken and by which camera; the identity's primary photo is marked. Prop `identityId` (the
 * identity page passes its record) and `primaryFileId`.
 */
export const photoGalleryBlock = defineBlock('itap:photo-gallery', {
  texts: {
    label: 'Photos',
    none: 'No photos yet. Use Add photos to give the platform the person’s face.',
    more: 'The newest {{shown}} of {{total}} photos.',
    primary: 'Primary',
    quality: 'Quality {{value}}',
    noQuality: 'Quality not scored',
    taken: 'Taken {{time}}',
    added: 'Added {{time}}',
    camera: 'by {{name}}',
    photo: '{{kind}} photo {{index}}',
  },
  props: {
    identityId: prop(z.string().nullable().optional()).default(null),
    primaryFileId: prop(z.string().nullable().optional()).default(null),
  },
  data: {
    photos: ({ props }) =>
      props.identityId ? source.query(identityPhotos, { identityId: props.identityId }) : absent(),
  },
});
