import { nhost } from '@/lib/nhost';
import { isTokenExpired } from '../lib/utils/jwt';
import { Session } from '@nhost/nhost-js/session';

const STORAGE_KEY = 'session';

class AuthService {
  getSession(): Session | null {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        this.logout();
      }
    }
    return null;
  }
  setSession(session: Session) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
  async logout() {
    try {
      await nhost.auth.signOut({});
    } catch {
      // skip
    }
    sessionStorage.removeItem(STORAGE_KEY);
  }
  async getAccessToken(): Promise<string | null> {
    const session = this.getSession();

    if (!session) {
      return null;
    }

    if (!isTokenExpired(session.accessToken, 1000)) {
      return session.accessToken;
    }

    try {
      const { body } = await nhost.auth.refreshToken({
        refreshToken: session.refreshToken,
      });

      this.setSession(body as Session);
    } catch {
      await this.logout();
      return null;
    }
    return session?.accessToken || null;
  }
}

export const authService = new AuthService();
