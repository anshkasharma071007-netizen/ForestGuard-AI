import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('fg_user') || 'null')
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('fg_token'))
  const [user, setUser] = useState(readStoredUser)
  const [bootstrapping, setBootstrapping] = useState(Boolean(localStorage.getItem('fg_token')))

  useEffect(() => {
    let active = true
    if (!token) {
      setBootstrapping(false)
      return undefined
    }
    api
      .get('/api/auth/me')
      .then((response) => {
        if (!active) return
        setUser(response.data.user)
        localStorage.setItem('fg_user', JSON.stringify(response.data.user))
      })
      .catch(() => {
        if (!active) return
        setToken(null)
        setUser(null)
        localStorage.removeItem('fg_token')
        localStorage.removeItem('fg_user')
      })
      .finally(() => active && setBootstrapping(false))
    return () => {
      active = false
    }
  }, [token])

  const login = useCallback(async (email, password) => {
    const response = await api.post('/api/auth/login', { email, password })
    localStorage.setItem('fg_token', response.data.token)
    localStorage.setItem('fg_user', JSON.stringify(response.data.user))
    setToken(response.data.token)
    setUser(response.data.user)
    return response.data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('fg_token')
    localStorage.removeItem('fg_user')
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ token, user, bootstrapping, login, logout, isAdmin: user?.role === 'admin' }),
    [token, user, bootstrapping, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
