import { formatDateTime, instantOf } from '../../fields/date-time-format';
import type { ContentSubject, ContentTarget, VersionContent } from './version-content-query';

type T = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;
type Label = (value: string) => string;

/** A person as the review names them: first and last name, else the profile code. */
export function personName(profile: ContentSubject['profile']): string | null {
  if (profile === null) return null;
  const name = [profile.first_name, profile.last_name].filter((part) => part !== null && part !== '').join(' ');
  return name !== '' ? name : profile.code;
}

/** One subject as a sentence (`Profile type: Employee`, `Access level Elevated or higher`). */
export function subjectText(subject: ContentSubject, t: T, typeLabel: Label, levelLabel: Label): string {
  const unnamed = t('unnamed');
  if (subject.profile_type !== null) return t('subjectType', { params: { name: typeLabel(subject.profile_type) } });
  if (subject.access_level !== null) return t('subjectLevel', { params: { name: levelLabel(subject.access_level) } });
  if (subject.segment !== null) return t('subjectSegment', { params: { name: subject.segment.name } });
  return t('subjectProfile', { params: { name: personName(subject.profile) ?? unnamed } });
}

/** One target as a sentence (`Area: Lobby (and the areas inside it)`). */
export function targetText(target: ContentTarget, t: T): string {
  if (target.facility !== null) return t('targetFacility', { params: { name: target.facility.name } });
  if (target.area !== null) return t('targetArea', { params: { name: target.area.name } });
  return t('targetPoint', { params: { name: target.access_point?.name ?? t('unnamed') } });
}

/** The validity window in words. */
export function validityText(version: Pick<VersionContent, 'valid_from' | 'valid_until'>, t: T, locale?: string): string {
  const from = instantOf(version.valid_from);
  const until = instantOf(version.valid_until);
  const at = (instant: number) => formatDateTime(instant, locale);
  if (from !== null && until !== null) return t('validBetween', { params: { from: at(from), until: at(until) } });
  if (from !== null) return t('validFrom', { params: { from: at(from) } });
  if (until !== null) return t('validUntil', { params: { until: at(until) } });
  return t('validAlways');
}
