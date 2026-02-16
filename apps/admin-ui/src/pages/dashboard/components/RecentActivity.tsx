import { FC } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface RecentIdentity {
  id: string;
  status: string;
  created_at: string;
  images: string[];
  profile: { first_name: string; last_name: string } | null;
}

interface RecentActivityProps {
  identities: RecentIdentity[];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const RecentActivity: FC<RecentActivityProps> = ({ identities }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {identities.length === 0 ? (
          <p className='text-muted-foreground text-sm'>No recent activity</p>
        ) : (
          <div className='space-y-3'>
            {identities.map((identity) => (
              <div
                key={identity.id}
                className='flex items-center gap-3 py-1.5'
              >
                <div className='w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0'>
                  {identity.profile
                    ? `${identity.profile.first_name[0]}${identity.profile.last_name[0]}`
                    : '?'}
                </div>
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-medium truncate'>
                    {identity.profile
                      ? `${identity.profile.first_name} ${identity.profile.last_name}`
                      : 'Unknown Identity'}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {timeAgo(identity.created_at)}
                  </p>
                </div>
                <Badge
                  variant={
                    identity.status === 'verified' ? 'default' : 'secondary'
                  }
                  className='text-xs shrink-0'
                >
                  {identity.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
