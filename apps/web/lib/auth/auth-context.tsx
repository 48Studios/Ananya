'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi, UserProfileDto, LoginPayload, PermissionGroup } from '../api/auth-api'

interface AuthContextType {
  user: UserProfileDto | null
  token: string | null
  permissions: string[]
  permissionGroups: PermissionGroup[]
  isAuthenticated: boolean
  loading: boolean
  login: (payload: LoginPayload) => Promise<void>
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
    const savedToken = localStorage.getItem(TOKEN_KEY)
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
    } catch {
      localStorage.removeItem(TOKEN_KEY)
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

  const login = async (payload: LoginPayload) => {
    const res = await authApi.login(payload)
    localStorage.setItem(TOKEN_KEY, res.token)
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
      setToken(null)
      setUser(null)
      setPermissions([])
    }
  }

  const hasPermission = useCallback(
    (requiredPermission: string): boolean => {
      if (!permissions || permissions.length === 0) {
        // Default dev fallback if logged in as default system user
        return true
      }
      if (permissions.includes('*')) return true
      if (permissions.includes(requiredPermission)) return true

      const [domain] = requiredPermission.split('.')
      if (domain && permissions.includes(`${domain}.*`)) return true

      return false
    },
    [permissions],
  )

  const hasRole = useCallback(
    (roleName: string): boolean => {
      if (!user) return false
      return user.roleName.toLowerCase() === roleName.toLowerCase()
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
