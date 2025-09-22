import { useState, useEffect } from 'react'
import { API_ENDPOINTS, createApiUrl } from '../config/api'
import { format } from 'date-fns'
import {
  Users,
  Calendar,
  Eye,
  AlertCircle,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle
} from 'lucide-react'

interface Profile {
  id: string
  firstName?: string
  lastName?: string
  email?: string
}

interface Identity {
  id: string
  status: string
  createdAt: string
  updatedAt: string
  attributes: Record<string, any>
  images: string[]
  profileId?: string
  profile?: Profile
  hasImages: boolean
  imageCount: number
}

export function IdentitiesPage() {
  const [identities, setIdentities] = useState<Identity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)

  const fetchIdentities = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(API_ENDPOINTS.identities)
      if (!response.ok) {
        throw new Error('Failed to fetch identities')
      }
      const data = await response.json()
      setIdentities(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIdentities()
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchIdentities, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this identity?')) return

    try {
      const response = await fetch(createApiUrl(`/api/identities/${id}`), {
        method: 'DELETE'
      })
      if (response.ok) {
        await fetchIdentities()
      }
    } catch (err) {
      console.error('Failed to delete identity:', err)
    }
  }

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to delete ALL identities? This cannot be undone!')) return

    try {
      const response = await fetch(createApiUrl('/api/identities/clear'), {
        method: 'POST'
      })
      if (response.ok) {
        await fetchIdentities()
      }
    } catch (err) {
      console.error('Failed to clear identities:', err)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'archived':
        return <XCircle className="h-4 w-4 text-gray-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      verified: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      unverified: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      archived: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
    return colors[status] || colors.unverified
  }

  if (loading && identities.length === 0) {
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
          <h1 className="text-3xl font-bold text-foreground">Identities</h1>
          <p className="text-muted-foreground">
            Manage and monitor all registered identities
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchIdentities}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          {identities.length > 0 && (
            <button
              onClick={handleClearAll}
              className="inline-flex items-center px-4 py-2 border border-red-300 dark:border-red-600 rounded-md shadow-sm text-sm font-medium text-red-700 dark:text-red-200 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 rounded-lg p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-500" />
              <span className="font-semibold">Total Identities: {identities.length}</span>
            </div>
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Verified: {identities.filter(i => i.status === 'verified').length}
              </span>
              <span className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                Unverified: {identities.filter(i => i.status === 'unverified').length}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4 text-blue-500" />
                With Profile: {identities.filter(i => i.profileId).length}
              </span>
            </div>
          </div>
        </div>

        {identities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Users className="h-12 w-12 mb-3 text-gray-400" />
            <p className="text-lg font-medium">No identities found</p>
            <p className="text-sm">Detected faces will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Photo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Profile
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {identities.map((identity) => (
                  <tr key={identity.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        {identity.images && identity.images.length > 0 ? (
                          identity.images.slice(0, 3).map((image, idx) => (
                            <img
                              key={idx}
                              src={image}
                              alt={`Identity ${identity.id}`}
                              className="h-12 w-12 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-primary"
                              onClick={() => setSelectedPhoto(image)}
                            />
                          ))
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                            <Users className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                        {identity.images && identity.images.length > 3 && (
                          <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300">
                            +{identity.images.length - 3}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-mono text-gray-900 dark:text-gray-100">
                        {identity.id.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(identity.status)}`}>
                        {getStatusIcon(identity.status)}
                        {identity.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {identity.profile ? (
                        <div className="text-sm">
                          <div className="text-gray-900 dark:text-gray-100 font-medium">
                            {identity.profile.firstName} {identity.profile.lastName}
                          </div>
                          {identity.profile.email && (
                            <div className="text-gray-500 dark:text-gray-400">
                              {identity.profile.email}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(identity.createdAt), 'MMM d, HH:mm')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(identity.updatedAt), 'MMM d, HH:mm')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleDelete(identity.id)}
                        className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Photo Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="max-w-3xl max-h-[90vh] p-4">
            <img
              src={selectedPhoto}
              alt="Identity photo"
              className="max-w-full max-h-full rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  )
}