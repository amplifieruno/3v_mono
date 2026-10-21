import type { TranslationBundle } from '@burojs/i18n-core';

/**
 * The `resources` namespace (English, primary): per-resource documentation
 * the declarations do not carry, such as article titles
 * (`<resource>.doc.topics.<topicId>`). Labels and `doc.summary` texts live on
 * the declarations themselves (`texts`); translations of them go into the
 * other locales' files beside this one.
 */
export default {} satisfies TranslationBundle;
