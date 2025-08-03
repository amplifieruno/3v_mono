import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  name: string
  role: string
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
        // TODO: Implement actual authentication
        // For demo purposes, we'll simulate a login
        const mockUser: User = {
          id: '1',
          email,
          name: 'Demo User',
          role: 'admin'
        }
        
        const mockToken = 'demo-jwt-token'
        
        set({
          user: mockUser,
          token: mockToken,
          isAuthenticated: true
        })
      },
      
      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false
        })
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