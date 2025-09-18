import { useState } from 'react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'

export function SettingsPage() {
  const [isClearing, setIsClearing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleClearDatabase = async () => {
    if (!showConfirm) {
      setShowConfirm(true)
      return
    }

    setIsClearing(true)
    setShowConfirm(false)

    try {
      const response = await fetch('/api/identities/clear', {
        method: 'POST',
      })

      const result = await response.json()

      if (result.success) {
        alert(`✅ ${result.message}`)
      } else {
        alert(`❌ Ошибка: ${result.error}`)
      }
    } catch (error) {
      alert(`❌ Ошибка сети: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsClearing(false)
    }
  }

  const cancelClear = () => {
    setShowConfirm(false)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">
          Configure platform settings and preferences
        </p>
      </div>

      {/* Database Management */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Database Management</h2>
            <p className="text-sm text-muted-foreground">
              Manage Identity database and stored face recognition data
            </p>
          </div>
          
          <div className="border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-950 p-4 rounded">
            <div className="space-y-3">
              <div>
                <h3 className="font-medium text-orange-800 dark:text-orange-200">
                  Clear All Identities
                </h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  This will permanently delete all Identity records from the database. 
                  This action cannot be undone and will remove all stored face embeddings, 
                  detection history, and associated data.
                </p>
              </div>
              
              {!showConfirm ? (
                <Button
                  variant="outline"
                  onClick={handleClearDatabase}
                  disabled={isClearing}
                  className="border-orange-500 text-orange-700 hover:bg-orange-100 dark:text-orange-300 dark:hover:bg-orange-900"
                >
                  {isClearing ? 'Clearing...' : 'Clear Identity Database'}
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    ⚠️ Are you absolutely sure? This action cannot be undone!
                  </p>
                  <div className="space-x-2">
                    <Button
                      variant="destructive"
                      onClick={handleClearDatabase}
                      disabled={isClearing}
                      size="sm"
                    >
                      {isClearing ? 'Clearing...' : 'Yes, Delete All'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={cancelClear}
                      disabled={isClearing}
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* System Information */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">System Information</h2>
            <p className="text-sm text-muted-foreground">
              Current system status and configuration
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Face Recognition:</span>
              <span className="ml-2 text-muted-foreground">InsightFace-REST</span>
            </div>
            <div>
              <span className="font-medium">Model:</span>
              <span className="ml-2 text-muted-foreground">glintr100 (512D)</span>
            </div>
            <div>
              <span className="font-medium">Detection:</span>
              <span className="ml-2 text-muted-foreground">scrfd_10g_gnkps</span>
            </div>
            <div>
              <span className="font-medium">Backend:</span>
              <span className="ml-2 text-muted-foreground">ONNX Runtime</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}