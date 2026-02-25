import { FC, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LinkIcon, SearchIcon } from 'lucide-react';
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

  const handleSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const pattern = `%${search.trim()}%`;
      const data = await gqlClient.request({
        document: ProfileSearchQuery,
        variables: {
          where: {
            _or: [
              { first_name: { _ilike: pattern } },
              { last_name: { _ilike: pattern } },
              { email: { _ilike: pattern } },
            ],
          },
          limit: 10,
        },
      });
      setResults(
        (data as { itap_profiles: ProfileResult[] }).itap_profiles ?? [],
      );
    } catch {
      toast.error('Failed to search profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async (profileId: string) => {
    setLinking(true);
    try {
      await gqlClient.request({
        document: IdentityUpdateOneMutation,
        variables: { id: identityId, object: { profile_id: profileId } },
      });
      toast.success('Profile linked successfully');
      onOpenChange(false);
      setSearch('');
      setResults([]);
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

        <div className='flex gap-2'>
          <Input
            placeholder='Search by name or email...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button
            variant='outline'
            onClick={handleSearch}
            disabled={loading}
          >
            <SearchIcon className='h-4 w-4' />
          </Button>
        </div>

        <div className='space-y-2 max-h-[300px] overflow-auto'>
          {loading && (
            <p className='text-sm text-muted-foreground text-center py-4'>
              Searching...
            </p>
          )}
          {!loading && results.length === 0 && search && (
            <p className='text-sm text-muted-foreground text-center py-4'>
              No profiles found
            </p>
          )}
          {results.map((profile) => (
            <div
              key={profile.id}
              className='flex items-center justify-between p-3 rounded-lg border'
            >
              <div>
                <p className='font-medium text-sm'>
                  {profile.first_name} {profile.last_name}
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
