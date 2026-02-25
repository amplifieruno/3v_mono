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
import { LinkIcon } from 'lucide-react';
import { gqlClient } from '@/shared/api/gql-client';
import {
  ProfileSearchQuery,
  IdentityUpdateOneMutation,
} from '../queries';
import { toast } from 'sonner';

interface LinkProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identityId: string;
  onLinked: () => void;
}

interface ProfileResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export const LinkProfileDialog: FC<LinkProfileDialogProps> = ({
  open,
  onOpenChange,
  identityId,
  onLinked,
}) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);

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
        document: ProfileSearchQuery,
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

  // Load profiles when dialog opens and when search changes
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => fetchProfiles(search), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [open, search, fetchProfiles]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearch('');
      setResults([]);
    }
  }, [open]);

  const handleLink = async (profileId: string) => {
    setLinking(true);
    try {
      await gqlClient.request({
        document: IdentityUpdateOneMutation,
        variables: { id: identityId, object: { profile_id: profileId } },
      });
      toast.success('Profile linked successfully');
      onOpenChange(false);
      onLinked();
    } catch {
      toast.error('Failed to link profile');
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link to Profile</DialogTitle>
          <DialogDescription>
            Search for a profile by name or email to link to this identity.
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
                  onClick={() => handleLink(profile.id)}
                  disabled={linking}
                >
                  <LinkIcon className='mr-1 h-3 w-3' />
                  Link
                </Button>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
