import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigation, useResourceParams, useShow } from '@refinedev/core';
import {
  ListIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react';
import { FC, useState } from 'react';
import { Link } from 'react-router';
import {
  SegmentWithMembersQuery,
  SegmentRemoveMemberMutation,
  SegmentRemoveProfileMemberMutation,
} from '../../queries';
import { RuleGroup, isRuleGroup } from '../../lib/conditionsToWhere';
import { RuleFieldDef, ruleFields, profileRuleFields } from '../../data/ruleFields';
import { AddProfileToSegmentDialog } from '../../components/AddProfileToSegmentDialog';
import { gqlClient } from '@/shared/api/gql-client';
import { toast } from 'sonner';

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

interface ProfileMembership {
  id: string;
  created_at: string;
  profile: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  };
}

const ConditionsSummary: FC<{
  conditions: RuleGroup;
  fields?: RuleFieldDef[];
}> = ({ conditions, fields = ruleFields }) => {
  if (!conditions?.rules?.length) {
    return (
      <span className='text-muted-foreground text-sm'>
        No conditions defined
      </span>
    );
  }

  const renderRule = (rule: RuleGroup['rules'][number]): string => {
    if (isRuleGroup(rule)) {
      const inner = rule.rules.map(renderRule).join(` ${rule.operator} `);
      return `(${inner})`;
    }
    const fieldDef = fields.find((f) => f.key === rule.field);
    const fieldLabel = fieldDef?.label ?? rule.field;
    const opLabel =
      fieldDef?.operators.find((o) => o.value === rule.operator)?.label ??
      rule.operator;
    if (rule.value) {
      return `${fieldLabel} ${opLabel} "${rule.value}"`;
    }
    return `${fieldLabel} ${opLabel}`;
  };

  const summary = conditions.rules
    .map(renderRule)
    .join(` ${conditions.operator} `);

  return (
    <code className='text-sm bg-muted px-2 py-1 rounded block'>{summary}</code>
  );
};

export const ShowPage: FC = () => {
  const { identifier, id } = useResourceParams();
  const { listUrl, editUrl } = useNavigation();
  const [addProfileOpen, setAddProfileOpen] = useState(false);

  const { query } = useShow({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    meta: { gqlQuery: SegmentWithMembersQuery as any },
  });

  const record = query?.data?.data as Record<string, unknown> | undefined;

  if (!record) {
    return <div>Loading...</div>;
  }

  const memberships = (record.memberships ?? []) as Membership[];
  const memberCount =
    (record.memberships_aggregate as { aggregate?: { count?: number } })
      ?.aggregate?.count ?? 0;

  const profileMemberships = (record.profile_memberships ??
    []) as ProfileMembership[];
  const profileMemberCount =
    (
      record.profile_memberships_aggregate as {
        aggregate?: { count?: number };
      }
    )?.aggregate?.count ?? 0;

  const handleRemoveIdentityMember = async (membershipId: string) => {
    if (!confirm('Remove this identity from the segment?')) return;
    try {
      await gqlClient.request({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        document: SegmentRemoveMemberMutation as any,
        variables: { id: membershipId },
      });
      toast.success('Identity removed from segment');
      query.refetch();
    } catch {
      toast.error('Failed to remove identity');
    }
  };

  const handleRemoveProfileMember = async (membershipId: string) => {
    if (!confirm('Remove this profile from the segment?')) return;
    try {
      await gqlClient.request({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        document: SegmentRemoveProfileMemberMutation as any,
        variables: { id: membershipId },
      });
      toast.success('Profile removed from segment');
      query.refetch();
    } catch {
      toast.error('Failed to remove profile');
    }
  };

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
        {/* Details Card */}
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
              <>
                <div>
                  <span className='text-sm text-muted-foreground'>
                    Identity Conditions
                  </span>
                  <ConditionsSummary
                    conditions={record.conditions as RuleGroup}
                  />
                </div>
                {(record.profile_conditions as RuleGroup)?.rules?.length >
                  0 && (
                  <div>
                    <span className='text-sm text-muted-foreground'>
                      Profile Conditions
                    </span>
                    <ConditionsSummary
                      conditions={record.profile_conditions as RuleGroup}
                      fields={profileRuleFields}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Members Card with Tabs */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <UsersIcon className='h-5 w-5' />
              Members ({memberCount} identities, {profileMemberCount} profiles)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue='identities'>
              <TabsList>
                <TabsTrigger value='identities'>
                  Identities ({memberCount})
                </TabsTrigger>
                <TabsTrigger value='profiles'>
                  Profiles ({profileMemberCount})
                </TabsTrigger>
              </TabsList>

              {/* Identity Members Tab */}
              <TabsContent value='identities'>
                {memberships.length === 0 ? (
                  <p className='text-muted-foreground text-sm'>
                    No identity members.
                  </p>
                ) : (
                  <div className='space-y-2'>
                    {memberships.map((m) => (
                      <div
                        key={m.id}
                        className='flex items-center gap-3 py-2 px-3 rounded-md bg-muted/50'
                      >
                        <Avatar className='h-8 w-8'>
                          {m.identity.images?.[0] ? (
                            <AvatarImage
                              src={m.identity.images[0]}
                              alt='Identity'
                            />
                          ) : null}
                          <AvatarFallback>
                            {m.identity.profile ? (
                              `${m.identity.profile.first_name[0]}${m.identity.profile.last_name[0]}`
                            ) : (
                              <UserIcon className='h-4 w-4' />
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className='flex-1 min-w-0'>
                          <Link
                            to={`/identities/show/${m.identity.id}`}
                            className='text-sm font-medium truncate hover:underline block'
                          >
                            {m.identity.profile
                              ? `${m.identity.profile.first_name} ${m.identity.profile.last_name}`
                              : 'Unknown Identity'}
                          </Link>
                        </div>
                        <Badge variant='outline' className='text-xs shrink-0'>
                          {m.identity.status}
                        </Badge>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-7 w-7 shrink-0'
                          onClick={() => handleRemoveIdentityMember(m.id)}
                        >
                          <TrashIcon className='h-3 w-3' />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Profile Members Tab */}
              <TabsContent value='profiles'>
                <div className='flex justify-end mb-3'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setAddProfileOpen(true)}
                  >
                    <PlusIcon className='h-3 w-3 mr-1' /> Add Profile
                  </Button>
                </div>
                {profileMemberships.length === 0 ? (
                  <p className='text-muted-foreground text-sm'>
                    No profile members.
                  </p>
                ) : (
                  <div className='space-y-2'>
                    {profileMemberships.map((m) => (
                      <div
                        key={m.id}
                        className='flex items-center gap-3 py-2 px-3 rounded-md bg-muted/50'
                      >
                        <div className='w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium'>
                          {m.profile.first_name?.[0]}
                          {m.profile.last_name?.[0]}
                        </div>
                        <div className='flex-1 min-w-0'>
                          <Link
                            to={`/profiles/show/${m.profile.id}`}
                            className='text-sm font-medium truncate hover:underline block'
                          >
                            {m.profile.first_name} {m.profile.last_name}
                          </Link>
                          {m.profile.email && (
                            <p className='text-xs text-muted-foreground truncate'>
                              {m.profile.email}
                            </p>
                          )}
                        </div>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-7 w-7 shrink-0'
                          onClick={() => handleRemoveProfileMember(m.id)}
                        >
                          <TrashIcon className='h-3 w-3' />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AddProfileToSegmentDialog
        open={addProfileOpen}
        onOpenChange={setAddProfileOpen}
        segmentId={String(id ?? '')}
        onAdded={() => query.refetch()}
      />
    </div>
  );
};
