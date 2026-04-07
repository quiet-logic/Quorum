/**
 * AuthContext — account-level authentication state.
 *
 * Separate from UserContext (which manages the active profile).
 * Flow: AuthContext (account) → UserContext (profile) → App
 *
 * Auth0 migration: replace the fetch calls in login/register with
 * Auth0 SDK calls. The context shape stays the same.
 */

import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // null = loading, false = unauthenticated, object = account
  const [account, setAccount] = useState(null);

  // Check session on mount
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => setAccount(data?.account ?? false))
      .catch(() => setAccount(false));
  }, []);

  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    setAccount(data.account);
    return data.account;
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setAccount(false);
  };

  const register = async (email, password, inviteCode) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, invite_code: inviteCode }),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return data;
  };

  return (
    <AuthContext.Provider value={{ account, setAccount, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
