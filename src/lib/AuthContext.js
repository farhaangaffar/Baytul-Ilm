import { createContext, useContext } from 'react';

// The signed-in user, from /api/session: { login, role: 'owner'|'teacher', teacherId,
// classId, classNames, platformAdmin, madrasah: { code, name, kind } }. kind is 'maktab' or
// 'darul_uloom' (a full-time Darul Uloom, which also gets the Darul Uloom pages). The server enforces
// every permission; this is only for showing people the pages and buttons they can use.
const AuthContext = createContext({ user: null, refresh: () => Promise.resolve() });

export const AuthProvider = AuthContext.Provider;

export function useAuth() {
  const { user, refresh } = useContext(AuthContext);
  return { user, refresh, isOwner: user?.role === 'owner', isTeacher: user?.role === 'teacher', isPlatformAdmin: !!user?.platformAdmin,
    isDarulUloom: user?.madrasah?.kind === 'darul_uloom',
    // A school's Islamic Studies department (src/pages/Studies.js): no fees, registers or maktab pages.
    isSchool: user?.madrasah?.kind === 'school',
    // A Darul Uloom with boarders (Settings → Boarding; a local Aalimiyyah course has none — no Boarding page, no
    // boarder / day student box, no boarders' fee).
    hasBoarding: user?.madrasah?.kind === 'darul_uloom' && user?.boarding !== false };
}
