import axios from 'axios'

const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const api = axios.create({ baseURL: base, timeout: 120000 })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fg_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname
      if (path !== '/login' && !path.startsWith('/community')) {
        localStorage.removeItem('fg_token')
        localStorage.removeItem('fg_user')
      }
    }
    return Promise.reject(error)
  },
)

export function mediaUrl(path) {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

export function errorMessage(error) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || JSON.stringify(item)).join('; ')
  }
  return error?.message || 'Something went wrong. Is the backend running on port 8000?'
}

export default api
