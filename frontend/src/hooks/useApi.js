import { useCallback, useEffect, useState } from 'react'
import api, { errorMessage } from '../api/client'

export function useApi(path, { deps = [], enabled = true, interval = 0 } = {}) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled && path))
  const [error, setError] = useState(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false)
      return undefined
    }
    let active = true
    setLoading(true)
    setError(null)
    let timer
    const controller = new AbortController()
    async function fetchData() {
      if (interval && document.visibilityState === 'hidden') {
        timer = setTimeout(fetchData, interval)
        return
      }
      try {
        const response = await api.get(path, { signal: controller.signal })
        if (active) {
          setResult({ path, data: response.data })
          setError(null)
        }
      } catch (err) {
        if (active) setError(errorMessage(err))
      } finally {
        if (active) {
          setLoading(false)
          if (interval) timer = setTimeout(fetchData, interval)
        }
      }
    }
    fetchData()
    return () => {
      active = false
      controller.abort()
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, interval, nonce, ...deps])

  return { data: result?.path === path && enabled ? result.data : null, loading, error, reload }
}
