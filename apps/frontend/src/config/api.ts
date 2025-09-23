// API configuration
const API_BASE_URL = ''; //import.meta.env.VITE_API_URL || ''

export const API_ENDPOINTS = {
  identities: `${API_BASE_URL}/api/identities`,
  profiles: `${API_BASE_URL}/api/profiles`,
  face: {
    detect: `${API_BASE_URL}/api/face/detect`,
    status: `${API_BASE_URL}/api/face/status`,
  }
}

// Helper function to create API URLs
export const createApiUrl = (path: string) => {
  return `${API_BASE_URL}${path}`
}