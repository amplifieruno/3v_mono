import { nhost } from '@/lib/nhost';
import type { AuthProvider } from '@refinedev/core';
import { authService } from './auth-service';

export const TOKEN_KEY = 'refine-auth';

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    if (email && password) {
      try {
        const { body } = await nhost.auth.signInEmailPassword({
          email,
          password,
        });

        if (body.session) {
          authService.setSession(body.session);
          return {
            success: true,
            redirectTo: '/',
          };
        }
      } catch {
        // skip
      }
    }

    return {
      success: false,
      error: {
        name: 'LoginError',
        message: 'Invalid username or password',
      },
    };
  },
  logout: async () => {
    await authService.logout();
    return {
      success: true,
      redirectTo: '/login',
    };
  },
  check: async () => {
    const session = authService.getSession();
    if (session) {
      return {
        authenticated: true,
      };
    }

    return {
      authenticated: false,
      redirectTo: '/login',
    };
  },
  getPermissions: async () => null,
  getIdentity: async () => {
    const { body: user } = await nhost.auth.getUser();
    if (user) {
      return {
        id: user.id,
        name: user.displayName,
        avatar: user.avatarUrl,
      };
    }
    return null;
  },
  onError: async (error) => {
    console.error(error);
    return { error };
  },
};
