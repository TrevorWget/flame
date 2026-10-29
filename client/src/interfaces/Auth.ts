export type SessionMethod = 'password' | 'oidc' | 'proxy';

export interface Session {
  isAuthenticated: boolean;
  // ms since the epoch; null for proxy sessions, which the proxy renews
  expiresAt: number | null;
  method: SessionMethod | null;
  // Set for OIDC and proxy sessions
  user: string | null;
  // Where to end a proxy session; Flame's own logout can't
  logoutUrl: string | null;
}

export interface AuthProviders {
  password: boolean;
  oidc: { name: string } | null;
}
