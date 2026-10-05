import { createContext, useContext } from 'react';

// The signed-in user, from /api/session: { login, role: 'owner'|'teacher', teacherId,
// classId, classNames, platformAdmin, madrasah: { code, name } }. The server enforces
// every permission; this is only for showing people the pages and buttons they can use.
const AuthContext = createContext({ user: null });

export const AuthProvider = AuthContext.Provider;

export function useAuth() {
  const { user } = useContext(AuthContext);
  return { user, isOwner: user?.role === 'owner', isTeacher: user?.role === 'teacher', isPlatformAdmin: !!user?.platformAdmin };
}
