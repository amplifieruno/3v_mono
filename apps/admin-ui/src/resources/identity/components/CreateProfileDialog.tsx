import { FC, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { gqlClient } from '@/shared/api/gql-client';
import {
  IdentityUpdateOneMutation,
} from '../queries';
import { ProfileInsertOneMutation } from '@/resources/profile/queries';
import { toast } from 'sonner';

interface CreateProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identityId: string;
  onCreated: () => void;
}

export const CreateProfileDialog: FC<CreateProfileDialogProps> = ({
  open,
  onOpenChange,
  identityId,
  onCreated,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      toast.error('First name is required');
      return;
    }
    setSubmitting(true);
    try {
      const result = await gqlClient.request({
        document: ProfileInsertOneMutation,
        variables: {
          object: {
            first_name: firstName.trim(),
            last_name: lastName.trim() || null,
            email: email.trim() || null,
          },
        },
      });
      const profileId = (
        result as { insert_itap_profiles_one: { id: string } }
      ).insert_itap_profiles_one.id;

      await gqlClient.request({
        document: IdentityUpdateOneMutation,
        variables: { id: identityId, object: { profile_id: profileId } },
      });

      toast.success('Profile created and linked');
      onOpenChange(false);
      setFirstName('');
      setLastName('');
      setEmail('');
      onCreated();
    } catch {
      toast.error('Failed to create profile');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Profile</DialogTitle>
          <DialogDescription>
            Create a new profile and link it to this identity.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='firstName'>First Name *</Label>
            <Input
              id='firstName'
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder='John'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='lastName'>Last Name</Label>
            <Input
              id='lastName'
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder='Doe'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='email'>Email</Label>
            <Input
              id='email'
              type='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder='john@example.com'
            />
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={submitting}>
              {submitting ? 'Creating...' : 'Create & Link'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
