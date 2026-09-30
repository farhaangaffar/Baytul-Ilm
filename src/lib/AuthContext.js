import { createContext, useContext } from 'react';

// The signed-in user, from /api/session: { username, role: 'owner'|'teacher',
// teacherId, classNames }. The server enforces every permission; this is only for
// showing people the pages and buttons they can actually use.
const AuthContext = createContext({ user: null });

export const AuthProvider = AuthContext.Provider;

export function useAuth() {
  const { user } = useContext(AuthContext);
  return { user, isOwner: user?.role === 'owner', isTeacher: user?.role === 'teacher' };
}
