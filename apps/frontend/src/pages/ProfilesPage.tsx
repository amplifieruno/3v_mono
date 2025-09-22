import { useState, useEffect } from 'react'
import { API_ENDPOINTS, createApiUrl } from '../config/api'
import { format } from 'date-fns'
import {
  Users,
  Calendar,
  Mail,
  Trash2,
  RefreshCw,
  Plus,
  Search,
  Edit,
  Link,
  Unlink
} from 'lucide-react'

interface Identity {
  id: string
  status: string
  createdAt: string
  updatedAt: string
  images: string[]
}

interface Profile {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  createdAt: string
  updatedAt: string
  identities?: Identity[]
}

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [newProfile, setNewProfile] = useState({
    firstName: '',
    lastName: '',
    email: ''
  })

  const fetchProfiles = async (search?: string) => {
    try {
      setLoading(true)
      setError(null)
      const url = search
        ? `${API_ENDPOINTS.profiles}?search=${encodeURIComponent(search)}`
        : API_ENDPOINTS.profiles
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to fetch profiles')
      }
      const data = await response.json()
      setProfiles(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchProfiles(searchQuery)
  }

  const handleCreateProfile = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.profiles, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProfile)
      })
      if (response.ok) {
        setShowCreateModal(false)
        setNewProfile({ firstName: '', lastName: '', email: '' })
        await fetchProfiles()
      }
    } catch (err) {
      console.error('Failed to create profile:', err)
    }
  }

  const handleUpdateProfile = async () => {
    if (!editingProfile) return

    try {
      const response = await fetch(createApiUrl(`/api/profiles/${editingProfile.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editingProfile.firstName,
          lastName: editingProfile.lastName,
          email: editingProfile.email
        })
      })
      if (response.ok) {
        setEditingProfile(null)
        await fetchProfiles()
      }
    } catch (err) {
      console.error('Failed to update profile:', err)
    }
  }

  const handleDeleteProfile = async (id: string) => {
    if (!confirm('Are you sure you want to delete this profile?')) return

    try {
      const response = await fetch(createApiUrl(`/api/profiles/${id}`), {
        method: 'DELETE'
      })
      if (response.ok) {
        await fetchProfiles()
      }
    } catch (err) {
      console.error('Failed to delete profile:', err)
    }
  }

  if (loading && profiles.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Profiles</h1>
          <p className="text-muted-foreground">
            Manage profiles and their associated identities
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Profile
          </button>
          <button
            onClick={() => fetchProfiles()}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="pl-10 pr-3 py-2 w-full border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
        >
          Search
        </button>
      </form>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 rounded-lg p-4">
          {error}
        </div>
      )}

      {/* Profiles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.map((profile) => (
          <div key={profile.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {profile.firstName || profile.lastName ?
                    `${profile.firstName || ''} ${profile.lastName || ''}`.trim() :
                    'Unnamed Profile'}
                </h3>
                {profile.email && (
                  <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                    <Mail className="h-3 w-3" />
                    {profile.email}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditingProfile(profile)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <Edit className="h-4 w-4 text-gray-500" />
                </button>
                <button
                  onClick={() => handleDeleteProfile(profile.id)}
                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </button>
              </div>
            </div>

            {/* Identities */}
            <div className="mb-3">
              <div className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Link className="h-3 w-3" />
                Linked Identities: {profile.identities?.length || 0}
              </div>
              {profile.identities && profile.identities.length > 0 && (
                <div className="flex -space-x-2">
                  {profile.identities.slice(0, 5).map((identity) => (
                    <div
                      key={identity.id}
                      className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center border-2 border-white dark:border-gray-800"
                    >
                      {identity.images && identity.images.length > 0 ? (
                        <img
                          src={identity.images[0]}
                          alt={`Identity ${identity.id}`}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <Users className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  ))}
                  {profile.identities.length > 5 && (
                    <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-2 border-white dark:border-gray-800 text-xs font-medium">
                      +{profile.identities.length - 5}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Timestamps */}
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Created: {format(new Date(profile.createdAt), 'MMM d, yyyy')}
              </div>
              <div className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                Updated: {format(new Date(profile.updatedAt), 'MMM d, yyyy')}
              </div>
            </div>
          </div>
        ))}
      </div>

      {profiles.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <Users className="h-12 w-12 mb-3 text-gray-400" />
          <p className="text-lg font-medium">No profiles found</p>
          <p className="text-sm">Create a profile to start managing identities</p>
        </div>
      )}

      {/* Create Profile Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Create New Profile</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">First Name</label>
                <input
                  type="text"
                  value={newProfile.firstName}
                  onChange={(e) => setNewProfile({ ...newProfile, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last Name</label>
                <input
                  type="text"
                  value={newProfile.lastName}
                  onChange={(e) => setNewProfile({ ...newProfile, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={newProfile.email}
                  onChange={(e) => setNewProfile({ ...newProfile, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProfile}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editingProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Edit Profile</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">First Name</label>
                <input
                  type="text"
                  value={editingProfile.firstName || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last Name</label>
                <input
                  type="text"
                  value={editingProfile.lastName || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={editingProfile.email || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setEditingProfile(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateProfile}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}