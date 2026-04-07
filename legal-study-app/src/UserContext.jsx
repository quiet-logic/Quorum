import { createContext, useContext, useState } from 'react';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [activeUser, setActiveUser] = useState(() => {
    const stored = localStorage.getItem('quorum_active_user');
    return stored ? JSON.parse(stored) : null;
  });

  const setUser = (user) => {
    setActiveUser(user);
    if (user) localStorage.setItem('quorum_active_user', JSON.stringify(user));
    else localStorage.removeItem('quorum_active_user');
  };

  // apiFetch: wraps fetch, injecting user_id + session credentials
  const apiFetch = (url, options = {}) => {
    const base = { credentials: 'include', ...options };
    const userId = activeUser?.id;
    if (!userId) return fetch(url, base);

    const method = (base.method || 'GET').toUpperCase();

    if (method === 'GET') {
      const sep = url.includes('?') ? '&' : '?';
      return fetch(`${url}${sep}user_id=${userId}`, base);
    }

    if (base.body) {
      const body = JSON.parse(base.body);
      return fetch(url, { ...base, body: JSON.stringify({ ...body, user_id: userId }) });
    }

    return fetch(url, base);
  };

  return (
    <UserContext.Provider value={{ activeUser, setUser, apiFetch }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
