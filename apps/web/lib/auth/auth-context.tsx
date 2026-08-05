"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { authApi, UserProfileDto, PermissionGroup } from "../api/auth-api";
import {
  registerUnauthorizedHandler,
  clearStoredAuthToken,
  broadcastAuthEvent,
} from "../api-client";

interface AuthContextType {
  user: UserProfileDto | null;
  token: string | null;
  permissions: string[];
  permissionGroups: PermissionGroup[];
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (requiredPermission: string) => boolean;
  hasRole: (roleName: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "ananya_auth_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfileDto | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  const clearLocalAuthState = useCallback(() => {
    clearStoredAuthToken();
    setUser(null);
    setToken(null);
    setPermissions([]);
    setPermissionGroups([]);
    setLoading(false);
  }, []);

  const refreshUser = useCallback(async () => {
    let savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken && typeof document !== "undefined") {
      const match = document.cookie.match(/ananya_auth_token=([^;]+)/);
      if (match && match[1]) savedToken = match[1];
    }

    if (!savedToken) {
      clearLocalAuthState();
      return;
    }

    try {
      setToken(savedToken);
      const res = await authApi.getMe();
      setUser(res.user);
      setPermissions(res.permissions || []);
      setPermissionGroups(res.permissionGroups || []);
      if (typeof document !== "undefined") {
        document.cookie = `ananya_auth_token=${savedToken}; path=/; max-age=604800; SameSite=Lax`;
      }
      localStorage.setItem(TOKEN_KEY, savedToken);
    } catch {
      clearLocalAuthState();
    } finally {
      setLoading(false);
    }
  }, [clearLocalAuthState]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Register 401 unauthorized handler & multi-tab listeners
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      clearLocalAuthState();
    });

    // Multi-tab BroadcastChannel listener
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("ananya_auth_channel");
      channel.onmessage = (event) => {
        if (
          event.data?.type === "LOGOUT" ||
          event.data?.type === "SESSION_EXPIRED"
        ) {
          clearLocalAuthState();
          if (
            typeof window !== "undefined" &&
            !window.location.pathname.startsWith("/login")
          ) {
            window.location.href = "/login?expired=true";
          }
        }
      };
    } catch {
      // BroadcastChannel fallback
    }

    // Storage event listener fallback for older browsers
    const handleStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY && !event.newValue) {
        clearLocalAuthState();
        if (
          typeof window !== "undefined" &&
          !window.location.pathname.startsWith("/login")
        ) {
          window.location.href = "/login?expired=true";
        }
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      if (channel) channel.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, [clearLocalAuthState]);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    localStorage.setItem(TOKEN_KEY, res.token);
    if (typeof document !== "undefined") {
      document.cookie = `ananya_auth_token=${res.token}; path=/; max-age=604800; SameSite=Lax`;
    }
    setToken(res.token);
    setUser(res.user);
    setPermissions(res.permissions || []);
    setPermissionGroups(res.permissionGroups || []);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout API errors
    } finally {
      clearLocalAuthState();
      broadcastAuthEvent("LOGOUT");
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        window.location.href = "/login";
      }
    }
  };

  const hasPermission = useCallback(
    (requiredPermission: string): boolean => {
      if (!user) return false;
      if (!permissions || permissions.length === 0) return true;
      if (permissions.includes("*")) return true;
      if (permissions.includes(requiredPermission)) return true;

      const [domain] = requiredPermission.split(".");
      if (domain && permissions.includes(`${domain}.*`)) return true;

      return false;
    },
    [user, permissions],
  );

  const hasRole = useCallback(
    (roleName: string): boolean => {
      if (!user) return false;
      return (user.roleName || "").toLowerCase() === roleName.toLowerCase();
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        permissions,
        permissionGroups,
        isAuthenticated: !!user,
        loading,
        login,
        logout,
        hasPermission,
        hasRole,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function PermissionGuard({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
