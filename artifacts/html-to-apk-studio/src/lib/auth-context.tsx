import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, saveUser, loadUser, clearUser, saveAdminUsername, loadAdminUsername, clearAdmin } from '@/lib/api';

type User = {
  id: string;
  email: string;
  name: string;
  isEmailVerified: boolean;
  isAdmin: boolean;
  isPremium: boolean;
  premiumExpiresAt: string | null;
  avatarUrl?: string | null;
  createdAt?: number;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  adminUsername: string | null;
  adminUser: any;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<any>;
  register: (email: string, password: string, name: string) => Promise<{ user: User; requiresVerification: boolean; devVerificationCode: string | null }>;
  logout: () => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<any>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  adminLogin: (username: string, password: string) => Promise<string>;
  adminLogout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminUsername, setAdminUsername] = useState<string | null>(loadAdminUsername());
  const [adminUser, setAdminUser] = useState<any>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.session();
      if (data.authenticated && data.user) {
        setUser(data.user);
        saveUser(data.user);
      } else {
        setUser(null);
        clearUser();
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
    // Refresh admin session too
    try {
      const adm = await api.adminSession();
      if (adm.authenticated) {
        setAdminUser(adm.user);
      } else {
        setAdminUser(null);
        setAdminUsername(null);
        clearAdmin();
      }
    } catch {
      setAdminUser(null);
    }
  }, []);

  useEffect(() => {
    // If we have a cached user, verify the session is still valid
    const cached = loadUser();
    if (cached) setUser(cached);
    refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const data = await api.login(email, password);
    setUser(data.user);
    saveUser(data.user);
    return data;
  };

  const register = async (email: string, password: string, name: string) => {
    const data = await api.register(email, password, name);
    if (data.user) {
      setUser(data.user);
      saveUser(data.user);
    }
    return data;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setUser(null);
    clearUser();
  };

  const verifyEmail = async (email: string, code: string) => {
    await api.verifyEmail(email, code);
    await refresh();
  };

  const resendVerification = async (email: string) => {
    await api.resendVerification(email);
  };

  const forgotPassword = async (email: string) => {
    return api.forgotPassword(email);
  };

  const resetPassword = async (email: string, code: string, password: string) => {
    await api.resetPassword(email, code, password);
  };

  const adminLogin = async (username: string, password: string) => {
    const data = await api.adminLogin(username, password);
    setAdminUsername(data.username);
    saveAdminUsername(data.username);
    const sess = await api.adminSession();
    setAdminUser(sess.user);
    return data.username;
  };

  const adminLogout = async () => {
    try {
      await api.adminLogout();
    } catch {
      // ignore
    }
    setAdminUsername(null);
    setAdminUser(null);
    clearAdmin();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        adminUsername,
        adminUser,
        refresh,
        login,
        register,
        logout,
        verifyEmail,
        resendVerification,
        forgotPassword,
        resetPassword,
        adminLogin,
        adminLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
