'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi, UserProfileDto, PermissionGroup } from '../api/auth-api'

interface AuthContextType {
  user: UserProfileDto | null
  token: string | null
  permissions: string[]
  permissionGroups: PermissionGroup[]
  isAuthenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  hasPermission: (requiredPermission: string) => boolean
  hasRole: (roleName: string) => boolean
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const TOKEN_KEY = 'ananya_auth_token'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfileDto | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([])
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    let savedToken = localStorage.getItem(TOKEN_KEY)
    if (!savedToken && typeof document !== 'undefined') {
      const match = document.cookie.match(/ananya_auth_token=([^;]+)/)
      if (match && match[1]) savedToken = match[1]
    }

    if (!savedToken) {
      setUser(null)
      setPermissions([])
      setToken(null)
      setLoading(false)
      return
    }

    try {
      setToken(savedToken)
      const res = await authApi.getMe()
      setUser(res.user)
      setPermissions(res.permissions || [])
      setPermissionGroups(res.permissionGroups || [])
      // Ensure cookie and localStorage stay synchronized
      if (typeof document !== 'undefined') {
        document.cookie = `ananya_auth_token=${savedToken}; path=/; max-age=604800; SameSite=Lax`
      }
      localStorage.setItem(TOKEN_KEY, savedToken)
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      if (typeof document !== 'undefined') {
        document.cookie = 'ananya_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      }
      setUser(null)
      setPermissions([])
      setToken(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password)
    localStorage.setItem(TOKEN_KEY, res.token)
    if (typeof document !== 'undefined') {
      document.cookie = `ananya_auth_token=${res.token}; path=/; max-age=604800; SameSite=Lax`
    }
    setToken(res.token)
    setUser(res.user)
    setPermissions(res.permissions || [])
    setPermissionGroups(res.permissionGroups || [])
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore logout errors
    } finally {
      localStorage.removeItem(TOKEN_KEY)
      if (typeof document !== 'undefined') {
        document.cookie = 'ananya_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      }
      setToken(null)
      setUser(null)
      setPermissions([])
      setPermissionGroups([])
    }
  }

  const hasPermission = useCallback(
    (requiredPermission: string): boolean => {
      if (!user) return false
      if (!permissions || permissions.length === 0) return true
      if (permissions.includes('*')) return true
      if (permissions.includes(requiredPermission)) return true

      const [domain] = requiredPermission.split('.')
      if (domain && permissions.includes(`${domain}.*`)) return true

      return false
    },
    [user, permissions],
  )

  const hasRole = useCallback(
    (roleName: string): boolean => {
      if (!user) return false
      return (user.roleName || '').toLowerCase() === roleName.toLowerCase()
    },
    [user],
  )

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
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export interface PermissionGuardProps {
  permission: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * PermissionGuard component.
 * Hides unauthorized actions/buttons (not merely disabling them).
 */
export function PermissionGuard({
  permission,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { hasPermission } = useAuth()

  if (!hasPermission(permission)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
