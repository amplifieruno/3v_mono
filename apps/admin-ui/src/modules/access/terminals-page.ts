import { defineAppAction, defineCustomPage, inlineFlow, ref } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { publishResultBlock } from './publish-result-block';
import { publishPolicyToTerminals } from './terminal-ops';
import { terminalSyncBlock } from './terminal-sync-block';

/** The page hosting the terminals' state and "Publish policy to terminals". */
export const TERMINALS_PAGE = 'access-terminals';
export const PUBLISH_POLICY_ACTION = 'publish_policy_to_terminals';

/** The facility the sidebar selects, from a flow's scope; `null` for every facility. */
export function scopeFacility(scope: Readonly<Record<string, unknown>> | undefined): string | null {
  const facility = scope?.facility;
  return typeof facility === 'string' && facility !== '' ? facility : null;
}

/**
 * "Publish policy to terminals" (app action: header strip and command palette, hosted on the
 * Terminals page): pushes the current rule set now (`publish_policy_to_terminals`) to the access
 * terminals of the facility selected in the sidebar, or of every facility, and shows each
 * terminal's result in the page's inline host (`then.open` of the result block; a hosted flow
 * keeps the answer on screen, G72). An app flow carries no form fields (G77): the sidebar's
 * facility is the choice.
 */
export const publishPolicyAction = defineAppAction({
  name: PUBLISH_POLICY_ACTION,
  kind: 'flow',
  texts: {
    label: 'Publish policy to terminals',
    doc: {
      summary:
        'Pushes the current access rule set now to every access terminal of the facility selected in the sidebar (or of every facility), and shows which terminals received it.',
    },
  },
  icon: NAV_ICONS.publishPolicy,
  order: 10,
  host: { page: TERMINALS_PAGE },
  // A review makes the flow hosted, so its answer is shown (G55).
  review: true,
  submit: {
    mutation: publishPolicyToTerminals,
    input: ({ scope }) => ({ facilityId: scopeFacility(scope) }),
  },
  then: { open: { block: publishResultBlock, props: { terminals: ref('result', 'terminals') } } },
});

/**
 * "Terminals" (Access control): every access terminal of the selected facility (or all) with its
 * policy sync state, read again every half minute, then what publishing does and "Publish policy
 * to terminals" inline (its answer replaces the button).
 */
export const terminalsPage = defineCustomPage({
  name: TERMINALS_PAGE,
  icon: NAV_ICONS.terminals,
  path: '/access-terminals',
  texts: 'Terminals',
  section: NAV_SECTIONS.access,
  order: 60,
  body: (l) => [
    l.place(terminalSyncBlock, { key: 'terminals', props: { facilityId: l.ref('scope', 'facility') } }),
    l.place(publishResultBlock, { key: 'publish-intro', props: { facilityId: l.ref('scope', 'facility') } }),
    l.place(inlineFlow, { key: 'publish', props: { flow: publishPolicyAction } }),
  ],
});
