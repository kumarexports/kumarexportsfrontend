import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const AuthContext = createContext(null)
const STORAGE_KEY = 'kumarexports-auth-user'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY))
      if (!raw?.user || !raw.expiresAt || Date.now() >= raw.expiresAt) {
        localStorage.removeItem(STORAGE_KEY)
        return null
      }
      return raw.user
    } catch {
      return null
    }
  })

  useEffect(() => {
    let timer
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY))
      const expiresAt = Number(raw?.expiresAt || 0)
      if (!expiresAt) return undefined
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) {
        localStorage.removeItem(STORAGE_KEY)
        setUser(null)
        return undefined
      }
      timer = window.setTimeout(() => {
        localStorage.removeItem(STORAGE_KEY)
        setUser(null)
      }, remaining)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      setUser(null)
    }
    return () => window.clearTimeout(timer)
  }, [user?.id])

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

  const login = useCallback(async (email, password) => {
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!data.ok) return { success: false, message: data.error || 'Login failed' }

      // store token and user in localStorage
      const payload = { token: data.token, user: data.user, expiresAt: Date.now() + 40 * 60 * 1000 }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      setUser(data.user)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [API_URL])

  const logout = useCallback(async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
      const token = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')?.token
      await fetch(`${API_URL}/api/logout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    } catch {
      // ignore network errors during logout
    }
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }, [API_URL])

  const value = useMemo(
    () => ({ user, isAuthenticated: Boolean(user), login, logout }),
    [user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
