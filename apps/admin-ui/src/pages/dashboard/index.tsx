import { FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FingerprintIcon,
  UserIcon,
  ShieldCheckIcon,
  LinkIcon,
  Building2Icon,
  TagsIcon,
  CameraIcon,
  WifiIcon,
  WifiOffIcon,
} from 'lucide-react';
import { DashboardMetricsQuery } from './queries';
import { MetricCard } from './components/MetricCard';
import { IdentityGrowthChart } from './components/IdentityGrowthChart';
import { StatusDistribution } from './components/StatusDistribution';
import { RecentActivity } from './components/RecentActivity';
import { gqlClient } from '@/shared/api';

interface DashboardData {
  identities_total: { aggregate: { count: number } };
  identities_verified: { aggregate: { count: number } };
  identities_linked: { aggregate: { count: number } };
  profiles_total: { aggregate: { count: number } };
  facilities_total: { aggregate: { count: number } };
  segments_total: { aggregate: { count: number } };
  devices_total: { aggregate: { count: number } };
  devices_online: { aggregate: { count: number } };
  devices_error: { aggregate: { count: number } };
  recent_identities: Array<{
    id: string;
    status: string;
    created_at: string;
    profile: { first_name: string; last_name: string } | null;
  }>;
  identity_timeline: Array<{ created_at: string }>;
}

export const DashboardPage: FC = () => {
  const { data: metrics, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      const result = await gqlClient.request(DashboardMetricsQuery);
      return result as DashboardData;
    },
    refetchInterval: 30000,
  });

  const totalIdentities = metrics?.identities_total?.aggregate?.count ?? 0;
  const verifiedIdentities = metrics?.identities_verified?.aggregate?.count ?? 0;
  const unverifiedIdentities = totalIdentities - verifiedIdentities;
  const totalProfiles = metrics?.profiles_total?.aggregate?.count ?? 0;
  const linkedProfiles = metrics?.identities_linked?.aggregate?.count ?? 0;
  const totalFacilities = metrics?.facilities_total?.aggregate?.count ?? 0;
  const totalSegments = metrics?.segments_total?.aggregate?.count ?? 0;
  const totalDevices = metrics?.devices_total?.aggregate?.count ?? 0;
  const onlineDevices = metrics?.devices_online?.aggregate?.count ?? 0;
  const errorDevices = metrics?.devices_error?.aggregate?.count ?? 0;

  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-20'>
        <p className='text-muted-foreground'>Loading dashboard...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className='flex items-center justify-center py-20'>
        <p className='text-destructive'>Failed to load dashboard. Please refresh the page.</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <h1 className='text-2xl font-semibold leading-none tracking-tight'>
        Dashboard
      </h1>

      <div className='grid gap-4 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-9'>
        <MetricCard
          title='Identities'
          value={totalIdentities}
          icon={FingerprintIcon}
          description='Total tracked'
        />
        <MetricCard
          title='Profiles'
          value={totalProfiles}
          icon={UserIcon}
          description='Known individuals'
        />
        <MetricCard
          title='Verified'
          value={verifiedIdentities}
          icon={ShieldCheckIcon}
          description='Confirmed identities'
        />
        <MetricCard
          title='Linked'
          value={linkedProfiles}
          icon={LinkIcon}
          description='Profile-linked'
        />
        <MetricCard
          title='Facilities'
          value={totalFacilities}
          icon={Building2Icon}
          description='Physical locations'
        />
        <MetricCard
          title='Segments'
          value={totalSegments}
          icon={TagsIcon}
          description='Identity groups'
        />
        <MetricCard
          title='Devices'
          value={totalDevices}
          icon={CameraIcon}
          description='Total devices'
        />
        <MetricCard
          title='Online'
          value={onlineDevices}
          icon={WifiIcon}
          description='Active devices'
        />
        <MetricCard
          title='Offline'
          value={errorDevices}
          icon={WifiOffIcon}
          description='Inactive/error'
        />
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <IdentityGrowthChart
          data={metrics?.identity_timeline ?? []}
        />
        <StatusDistribution
          verified={verifiedIdentities}
          unverified={unverifiedIdentities}
        />
      </div>

      <RecentActivity identities={metrics?.recent_identities ?? []} />
    </div>
  );
};

export default DashboardPage;
