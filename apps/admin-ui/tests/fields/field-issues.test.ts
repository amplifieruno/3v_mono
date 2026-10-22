import { describe, expect, it } from 'vitest';
import { checkRange, rangeValidator } from '../../src/fields/bounded-number';
import { problemIssue } from '../../src/fields/field-issue';
import { checkStringList } from '../../src/fields/string-list';
import { validateStringList } from '../../src/fields/string-list-format';
import {
  checkConfiguration,
  checkIpAddress,
  checkStreamUrl,
  configurationProblem,
  ipAddressProblem,
  streamUrlProblem,
} from '../../src/modules/devices/device-checks';
import { checkFromArea, fromAreaProblem } from '../../src/modules/places/access-point';
import { checkContact, contactProblem } from '../../src/modules/places/facility';
import { expectTranslated, validatorResult } from '../support/field-issues';

/**
 * The reusable fields' validators answer with a translatable issue (`validation.itap.<code>`
 * in the `common` bundle, params interpolated), not an English literal that buro would show
 * only as its generic "invalid" text in another locale.
 */

describe('string list issues', () => {
  it('should refuse each malformed list with a translatable issue', async () => {
    const refused: readonly [unknown, string][] = [
      [{ day: true }, 'Options must be a list.'],
      [[], 'Add at least one option.'],
      [['day', 3], 'Option 2 is not text.'],
      [['day', ' '], 'Option 2 is empty.'],
      [['day', 'night', 'day'], 'Option 3 repeats option 1.'],
    ];
    const validate = checkStringList('Option');
    for (const [value, text] of refused) {
      const problem = validateStringList(value, { item: 'Option' });
      expect(problem?.text, JSON.stringify(value)).toBe(text);
      if (problem === null) continue;
      expect(await validatorResult(validate, value)).toEqual(problemIssue(problem));
      await expectTranslated(problem);
    }
    expect(await validatorResult(validate, ['day', 'night'])).toBeNull();
  });
});

describe('number range issues', () => {
  it('should name the range in a translatable issue', async () => {
    const ranges = [
      { min: 30, max: 86400, integer: true },
      { min: 0.1, max: 0.9 },
      { min: 1, integer: true },
      { min: 0 },
    ] as const;
    for (const range of ranges) {
      const problem = checkRange(range.min - 1, range);
      expect(problem, JSON.stringify(range)).not.toBeNull();
      if (problem === null) continue;
      expect(problem.params).toMatchObject({ min: range.min });
      expect(await validatorResult(rangeValidator(range), range.min - 1)).toEqual(
        problemIssue(problem),
      );
      await expectTranslated(problem);
    }
    expect(checkRange(30.5, ranges[0])?.text).toBe('Enter a whole number from 30 to 86400.');
    expect(checkRange(null, ranges[0])).toBeNull();
  });
});

describe('places check issues', () => {
  it('should refuse a contact that is not a JSON object with a translatable issue', async () => {
    for (const value of [[], 'desk', null]) {
      const problem = contactProblem(value);
      expect(problem?.code, JSON.stringify(value)).toBe('facility.contactNotObject');
      if (problem === null) continue;
      expect(await validatorResult(checkContact, value)).toEqual(problemIssue(problem));
      await expectTranslated(problem);
    }
    expect(contactProblem({})).toBeNull();
  });

  it('should refuse leading from the area it leads into with a translatable issue', async () => {
    const problem = fromAreaProblem('a1', { area_id: 'a1' });
    expect(problem?.code).toBe('accessPoint.sameArea');
    if (problem !== null) {
      expect(checkFromArea('a1', { values: { area_id: 'a1' } })).toEqual(problemIssue(problem));
      await expectTranslated(problem);
    }
    expect(fromAreaProblem('a2', { area_id: 'a1' })).toBeNull();
    expect(fromAreaProblem(null, { area_id: 'a1' })).toBeNull();
  });
});

describe('device check issues', () => {
  it('should refuse what the devices table refuses with translatable issues', async () => {
    const cases = [
      [ipAddressProblem, checkIpAddress, '10.0.0.300', 'device.ipAddress'],
      [ipAddressProblem, checkIpAddress, 'camera-1', 'device.ipAddress'],
      [streamUrlProblem, checkStreamUrl, 'rtsp://admin:pw@10.0.0.20/live', 'device.streamCredentials'],
      [configurationProblem, checkConfiguration, ['tcp'], 'device.configurationNotObject'],
    ] as const;
    for (const [check, validate, value, code] of cases) {
      const problem = check(value);
      expect(problem?.code, JSON.stringify(value)).toBe(code);
      if (problem === null) continue;
      expect(await validatorResult(validate, value)).toEqual(problemIssue(problem));
      await expectTranslated(problem);
    }
    for (const ip of ['10.0.0.20', '192.168.1.0/24', 'fd00::20', '::1', '', null]) {
      expect(ipAddressProblem(ip), String(ip)).toBeNull();
    }
    expect(streamUrlProblem('rtsp://10.0.0.20/live?user=a@b')).toBeNull();
    expect(configurationProblem({})).toBeNull();
  });
});
