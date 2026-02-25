import { FC, useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';
import { gqlClient } from '@/shared/api/gql-client';
import {
  ProfileSearchForSegmentQuery,
  SegmentAddProfileMembersMutation,
} from '../queries';
import { toast } from 'sonner';

interface AddProfileToSegmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segmentId: string;
  onAdded: () => void;
}

interface ProfileResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export const AddProfileToSegmentDialog: FC<AddProfileToSegmentDialogProps> = ({
  open,
  onOpenChange,
  segmentId,
  onAdded,
}) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const fetchProfiles = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const trimmed = query.trim();
      const where = trimmed
        ? {
            _or: [
              { first_name: { _ilike: `%${trimmed}%` } },
              { last_name: { _ilike: `%${trimmed}%` } },
              { email: { _ilike: `%${trimmed}%` } },
            ],
          }
        : {};
      const data = await gqlClient.request({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        document: ProfileSearchForSegmentQuery as any,
        variables: { where, limit: trimmed ? 10 : 5 },
      });
      setResults(
        (data as { itap_profiles: ProfileResult[] }).itap_profiles ?? [],
      );
    } catch {
      toast.error('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => fetchProfiles(search), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [open, search, fetchProfiles]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setResults([]);
    }
  }, [open]);

  const handleAdd = async (profileId: string) => {
    setAdding(true);
    try {
      await gqlClient.request({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        document: SegmentAddProfileMembersMutation as any,
        variables: {
          objects: [
            { segment_id: segmentId, profile_id: profileId, is_active: true },
          ],
        },
      });
      toast.success('Profile added to segment');
      onOpenChange(false);
      onAdded();
    } catch {
      toast.error('Failed to add profile');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Profile to Segment</DialogTitle>
          <DialogDescription>
            Search for a profile by name or email to add to this segment.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder='Filter by name or email...'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className='space-y-2 max-h-[300px] overflow-auto'>
          {loading && (
            <p className='text-sm text-muted-foreground text-center py-4'>
              Loading...
            </p>
          )}
          {!loading && results.length === 0 && (
            <p className='text-sm text-muted-foreground text-center py-4'>
              {search ? 'No profiles found' : 'No profiles exist yet'}
            </p>
          )}
          {!loading &&
            results.map((profile) => (
              <div
                key={profile.id}
                className='flex items-center justify-between p-3 rounded-lg border'
              >
                <div>
                  <p className='font-medium text-sm'>
                    {[profile.first_name, profile.last_name]
                      .filter(Boolean)
                      .join(' ') || 'Unnamed'}
                  </p>
                  {profile.email && (
                    <p className='text-xs text-muted-foreground'>
                      {profile.email}
                    </p>
                  )}
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handleAdd(profile.id)}
                  disabled={adding}
                >
                  <PlusIcon className='mr-1 h-3 w-3' />
                  Add
                </Button>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
