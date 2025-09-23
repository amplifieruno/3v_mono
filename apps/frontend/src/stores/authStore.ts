import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { API_ENDPOINTS } from '../config/api'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  permissions: string[]
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: User) => void
  setToken: (token: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      
      login: async (email: string, password: string) => {
        try {
          const response = await fetch(API_ENDPOINTS.auth.login, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
          })

          const data = await response.json()

          if (!response.ok || !data.success) {
            throw new Error(data.error || 'Login failed')
          }

          const { user, token } = data.data

          set({
            user,
            token,
            isAuthenticated: true
          })
        } catch (error) {
          console.error('Login error:', error)
          throw error
        }
      },
      
      logout: async () => {
        try {
          // Call backend logout endpoint
          await fetch(API_ENDPOINTS.auth.logout, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          })
        } catch (error) {
          console.error('Logout error:', error)
        } finally {
          // Clear local state regardless of backend response
          set({
            user: null,
            token: null,
            isAuthenticated: false
          })
        }
      },
      
      setUser: (user: User) => {
        set({ user, isAuthenticated: true })
      },
      
      setToken: (token: string) => {
        set({ token })
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)