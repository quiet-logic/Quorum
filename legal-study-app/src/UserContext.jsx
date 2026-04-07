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

  // apiFetch: wraps fetch, injecting user_id into GET query strings or POST bodies
  const apiFetch = (url, options = {}) => {
    const userId = activeUser?.id;
    if (!userId) return fetch(url, options);

    const method = (options.method || 'GET').toUpperCase();

    if (method === 'GET') {
      const sep = url.includes('?') ? '&' : '?';
      return fetch(`${url}${sep}user_id=${userId}`, options);
    }

    if (options.body) {
      const body = JSON.parse(options.body);
      return fetch(url, { ...options, body: JSON.stringify({ ...body, user_id: userId }) });
    }

    return fetch(url, options);
  };

  return (
    <UserContext.Provider value={{ activeUser, setUser, apiFetch }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
