import { jwtDecode } from 'jwt-decode';

export const isTokenExpired = (token: string, leewayMS: number = 0) => {
  const decoded = jwtDecode(token);
  const now = Date.now() / 1000;
  return decoded.exp && decoded.exp < now + leewayMS / 1000;
};
