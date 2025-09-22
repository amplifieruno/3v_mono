import { useState, useEffect } from 'react'
import { API_ENDPOINTS, createApiUrl } from '../config/api'
import { format } from 'date-fns'
import {
  Users,
  Calendar,
  AlertCircle,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  GitCompare,
  X,
  BarChart3
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

interface ComparisonResult {
  identity: Identity
  similarity: number
  distance: number
}

export function IdentitiesPage() {
  const [identities, setIdentities] = useState<Identity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([])
  const [comparisonMode, setComparisonMode] = useState(false)
  const [comparisonResult, setComparisonResult] = useState<{
    baseIdentity: Identity
    comparisons: ComparisonResult[]
  } | null>(null)
  const [showComparisonModal, setShowComparisonModal] = useState(false)

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
      verified: 'bg-green-100 text-green-800',
      unverified: 'bg-yellow-100 text-yellow-800',
      archived: 'bg-gray-100 text-gray-800'
    }
    return colors[status] || colors.unverified
  }

  const handleComparisonToggle = (identityId: string) => {
    if (selectedForComparison.includes(identityId)) {
      setSelectedForComparison(prev => prev.filter(id => id !== identityId))
    } else {
      setSelectedForComparison(prev => [...prev, identityId])
    }
  }

  const startComparison = () => {
    setComparisonMode(true)
    setSelectedForComparison([])
  }

  const cancelComparison = () => {
    setComparisonMode(false)
    setSelectedForComparison([])
  }

  const performComparison = async () => {
    if (selectedForComparison.length < 2) {
      alert('Select at least 2 identities for comparison')
      return
    }

    try {
      const response = await fetch(createApiUrl('/api/identities/compare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityIds: selectedForComparison })
      })

      if (response.ok) {
        const data = await response.json()
        setComparisonResult(data.data)
        setShowComparisonModal(true)
        setComparisonMode(false)
        setSelectedForComparison([])
      }
    } catch (err) {
      console.error('Failed to compare identities:', err)
    }
  }

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.8) return 'text-green-600 bg-green-50'
    if (similarity >= 0.6) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
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
          {comparisonMode ? (
            <>
              <span className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-md">
                <GitCompare className="h-4 w-4 mr-2" />
                Selected: {selectedForComparison.length}
              </span>
              <button
                onClick={performComparison}
                disabled={selectedForComparison.length < 2}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Compare
              </button>
              <button
                onClick={cancelComparison}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </button>
            </>
          ) : (
            <>
              {identities.length > 1 && (
                <button
                  onClick={startComparison}
                  className="inline-flex items-center px-4 py-2 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 bg-white hover:bg-blue-50"
                >
                  <GitCompare className="h-4 w-4 mr-2" />
                  Compare
                </button>
              )}
              <button
                onClick={fetchIdentities}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </button>
              {identities.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {comparisonMode && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-4">
          <div className="flex">
            <GitCompare className="h-5 w-5 mr-2 flex-shrink-0" />
            <span>Comparison mode: select at least 2 identities to compare vector similarity</span>
          </div>
        </div>
      )}

      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200">
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
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {comparisonMode && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Select
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Photo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Profile
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {identities.map((identity) => (
                  <tr key={identity.id} className={`hover:bg-gray-50 ${
                    selectedForComparison.includes(identity.id) ? 'bg-blue-50' : ''
                  }`}>
                    {comparisonMode && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedForComparison.includes(identity.id)}
                          onChange={() => handleComparisonToggle(identity.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </td>
                    )}
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
                          <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                            <Users className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                        {identity.images && identity.images.length > 3 && (
                          <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                            +{identity.images.length - 3}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-mono text-gray-900">
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
                          <div className="text-gray-900 font-medium">
                            {identity.profile.firstName} {identity.profile.lastName}
                          </div>
                          {identity.profile.email && (
                            <div className="text-gray-500">
                              {identity.profile.email}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(identity.createdAt), 'MMM d, HH:mm')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(identity.updatedAt), 'MMM d, HH:mm')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {!comparisonMode && (
                        <button
                          onClick={() => handleDelete(identity.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
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

      {/* Comparison Results Modal */}
      {showComparisonModal && comparisonResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Vector Similarity Comparison</h2>
              <button
                onClick={() => setShowComparisonModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Base Identity */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3">Base Identity (Reference)</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-4">
                  <div className="flex gap-2">
                    {comparisonResult.baseIdentity.images?.length > 0 ? (
                      comparisonResult.baseIdentity.images.slice(0, 3).map((image, idx) => (
                        <img
                          key={idx}
                          src={image}
                          alt="Base identity"
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                      ))
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-gray-200 flex items-center justify-center">
                        <Users className="h-8 w-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-mono text-sm text-gray-600">
                      ID: {comparisonResult.baseIdentity.id.slice(0, 8)}...
                    </div>
                    <div className="text-sm">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(comparisonResult.baseIdentity.status)}`}>
                        {getStatusIcon(comparisonResult.baseIdentity.status)}
                        {comparisonResult.baseIdentity.status}
                      </span>
                    </div>
                    {comparisonResult.baseIdentity.profile && (
                      <div className="text-sm text-gray-600 mt-1">
                        {comparisonResult.baseIdentity.profile.firstName} {comparisonResult.baseIdentity.profile.lastName}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Comparison Results */}
            <div>
              <h3 className="text-lg font-medium mb-3">Comparison Results</h3>
              <div className="space-y-3">
                {comparisonResult.comparisons.map((comparison, index) => (
                  <div
                    key={comparison.identity.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex gap-2">
                          {comparison.identity.images?.length > 0 ? (
                            comparison.identity.images.slice(0, 3).map((image, idx) => (
                              <img
                                key={idx}
                                src={image}
                                alt="Comparison identity"
                                className="h-12 w-12 rounded-lg object-cover"
                              />
                            ))
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-gray-200 flex items-center justify-center">
                              <Users className="h-6 w-6 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-mono text-sm text-gray-600">
                            ID: {comparison.identity.id.slice(0, 8)}...
                          </div>
                          <div className="text-sm">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(comparison.identity.status)}`}>
                              {getStatusIcon(comparison.identity.status)}
                              {comparison.identity.status}
                            </span>
                          </div>
                          {comparison.identity.profile && (
                            <div className="text-sm text-gray-600 mt-1">
                              {comparison.identity.profile.firstName} {comparison.identity.profile.lastName}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`text-lg font-bold px-3 py-1 rounded-lg ${getSimilarityColor(comparison.similarity)}`}>
                          {(comparison.similarity * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Distance: {comparison.distance.toFixed(4)}
                        </div>
                      </div>
                    </div>

                    {/* Similarity Bar */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Vector Similarity</span>
                        <span>{(comparison.similarity * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            comparison.similarity >= 0.8 ? 'bg-green-500' :
                            comparison.similarity >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${comparison.similarity * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 text-xs text-gray-500">
              <p>💡 Similarity is calculated using PostgreSQL's cosine distance between face embedding vectors.</p>
              <p>Green (≥80%): Very similar faces, likely same person</p>
              <p>Yellow (60-79%): Moderate similarity, possible match</p>
              <p>Red (≤59%): Low similarity, likely different people</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}