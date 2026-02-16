import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigation, useResourceParams, useShow } from '@refinedev/core';
import { ListIcon, PencilIcon, UsersIcon } from 'lucide-react';
import { FC } from 'react';
import { Link } from 'react-router';
import { SegmentWithMembersQuery } from '../../queries';
import { RuleGroup, isRuleGroup } from '../../lib/conditionsToWhere';
import { ruleFields } from '../../data/ruleFields';

interface MemberIdentity {
  id: string;
  status: string;
  images: string[];
  profile: { first_name: string; last_name: string } | null;
}

interface Membership {
  id: string;
  created_at: string;
  identity: MemberIdentity;
}

const ConditionsSummary: FC<{ conditions: RuleGroup }> = ({ conditions }) => {
  if (!conditions?.rules?.length) {
    return <span className='text-muted-foreground text-sm'>No conditions defined</span>;
  }

  const renderRule = (rule: RuleGroup['rules'][number]): string => {
    if (isRuleGroup(rule)) {
      const inner = rule.rules.map(renderRule).join(` ${rule.operator} `);
      return `(${inner})`;
    }
    const fieldDef = ruleFields.find((f) => f.key === rule.field);
    const fieldLabel = fieldDef?.label ?? rule.field;
    const opLabel =
      fieldDef?.operators.find((o) => o.value === rule.operator)?.label ??
      rule.operator;
    if (rule.value) {
      return `${fieldLabel} ${opLabel} "${rule.value}"`;
    }
    return `${fieldLabel} ${opLabel}`;
  };

  const summary = conditions.rules.map(renderRule).join(` ${conditions.operator} `);

  return <code className='text-sm bg-muted px-2 py-1 rounded block'>{summary}</code>;
};

export const ShowPage: FC = () => {
  const { identifier, id } = useResourceParams();
  const { listUrl, editUrl } = useNavigation();

  const { query } = useShow({
    meta: { gqlQuery: SegmentWithMembersQuery },
  });

  const record = query?.data?.data as Record<string, unknown> | undefined;

  if (!record) {
    return <div>Loading...</div>;
  }

  const memberships = (record.memberships ?? []) as Membership[];
  const memberCount =
    (record.memberships_aggregate as { aggregate?: { count?: number } })
      ?.aggregate?.count ?? 0;

  return (
    <div>
      <div className='flex justify-between'>
        <div className='flex items-center gap-3'>
          <span
            className='w-4 h-4 rounded-full'
            style={{ backgroundColor: String(record.color) }}
          />
          <h1 className='text-2xl font-semibold leading-none tracking-tight'>
            {String(record.name)}
          </h1>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' asChild>
            <Link to={editUrl('itap_segments', id ?? '')}>
              <PencilIcon /> Edit
            </Link>
          </Button>
          <Button variant='outline' size='sm' asChild>
            <Link to={listUrl(identifier ?? '')}>
              <ListIcon /> Back to list
            </Link>
          </Button>
        </div>
      </div>

      <div className='mt-4 grid gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div>
              <span className='text-sm text-muted-foreground'>Status</span>
              <div>
                <Badge>{String(record.status)}</Badge>
              </div>
            </div>
            <div>
              <span className='text-sm text-muted-foreground'>Type</span>
              <div>
                <Badge variant='outline'>
                  {record.segment_type === 'rule_based'
                    ? 'Rule-based'
                    : 'Manual'}
                </Badge>
              </div>
            </div>
            {record.description ? (
              <div>
                <span className='text-sm text-muted-foreground'>
                  Description
                </span>
                <p className='text-sm'>{String(record.description)}</p>
              </div>
            ) : null}
            {record.segment_type === 'rule_based' && (
              <div>
                <span className='text-sm text-muted-foreground'>
                  Conditions
                </span>
                <ConditionsSummary
                  conditions={record.conditions as RuleGroup}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <UsersIcon className='h-5 w-5' />
              Members ({memberCount})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {memberships.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                No members in this segment yet.
              </p>
            ) : (
              <div className='space-y-2'>
                {memberships.map((m) => (
                  <div
                    key={m.id}
                    className='flex items-center gap-3 py-2 px-3 rounded-md bg-muted/50'
                  >
                    <div className='w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium'>
                      {m.identity.profile?.first_name && m.identity.profile?.last_name
                        ? `${m.identity.profile.first_name[0]}${m.identity.profile.last_name[0]}`
                        : '?'}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium truncate'>
                        {m.identity.profile
                          ? `${m.identity.profile.first_name} ${m.identity.profile.last_name}`
                          : 'Unknown Identity'}
                      </p>
                    </div>
                    <Badge variant='outline' className='text-xs'>
                      {m.identity.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
