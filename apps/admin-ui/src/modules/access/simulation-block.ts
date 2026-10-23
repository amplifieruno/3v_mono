import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * "Simulate" (`itap:access-policy-simulation`): a policy version tried against the doors'
 * decisions of a past period with `simulate_access_policy`, which reads only (nothing is decided,
 * recorded or sent). Says how many decisions it would turn from granted to denied and back, and
 * lists them with what the door decided then, today's policies and the version's answer. Prop
 * `versionId` (the version's "Simulate" action passes its record).
 */
export const simulationBlock = defineBlock('itap:access-policy-simulation', {
  texts: {
    label: 'Simulation',
    intro:
      'The doors’ past decisions are evaluated again at their own time, once with the policies in force today and once with this version in force instead. Nothing is decided, recorded or sent.',
    period: 'Period',
    period_1d: 'Last 24 hours',
    period_7d: 'Last 7 days',
    period_30d: 'Last 30 days',
    limit: 'Changes to list',
    run: 'Simulate again',
    running: 'Simulating…',
    failed: 'The simulation could not be run.',
    gone: 'The version no longer exists.',
    periodInvalid: 'The period is not accepted (at most 31 days).',
    none: 'No door decided anything in the period: there is nothing to simulate against.',
    summary: '{{evaluated}} of {{total}} decisions evaluated: {{toDenied}} would be denied instead of granted, {{toGranted}} granted instead of denied, {{reasons}} decided for another reason.',
    unchanged: 'No decision would change.',
    sampled: 'The period had more decisions than are evaluated at once: an evenly spaced sample was evaluated.',
    skipped: '{{count}} decisions could not be evaluated again (their person or door changed since) and were skipped.',
    drifted: '{{count}} decisions would come out differently today even without this version: the policies or the people changed since.',
    more: 'The first {{shown}} changes are listed.',
    when: 'When',
    person: 'Person',
    door: 'Access point',
    recorded: 'Decided then',
    today: 'Today',
    withVersion: 'With this version',
    drift: 'Changed since',
    unknownPerson: 'Unknown face',
    gonePerson: 'Person deleted or not visible',
    gonePlace: 'Deleted or not visible',
    simulated: 'Simulated {{time}}.',
  },
  props: {
    versionId: prop(z.string().nullable().optional()).default(null),
  },
});
