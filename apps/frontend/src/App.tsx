import { Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { DashboardPage } from '@/pages/DashboardPage'
import { IdentitiesPage } from '@/pages/IdentitiesPage'
import { DevicesPage } from '@/pages/DevicesPage'
import { FacilitiesPage } from '@/pages/FacilitiesPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { FaceDebugPage } from '@/pages/FaceDebugPage'
import { LoginPage } from '@/pages/LoginPage'
import { useAuthStore } from '@/stores/authStore'

function App() {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/identities" element={<IdentitiesPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/facilities" element={<FacilitiesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/debug/face-detection" element={<FaceDebugPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  )
}

export default App