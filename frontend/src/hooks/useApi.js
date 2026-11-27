import { useCallback, useEffect, useRef, useState } from 'react'
import api, { errorMessage } from '../api/client'

export function useApi(path, { deps = [], enabled = true, interval = 0 } = {}) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled && path))
  const [error, setError] = useState(null)
  const control = useRef(null)
  const reload = useCallback(() => control.current?.(), [])

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false)
      return undefined
    }
    const controller = new AbortController()
    let timer
    let request
    setError(null)

    function schedule() {
      if (interval && !controller.signal.aborted) timer = setTimeout(() => fetchData(false), interval)
    }

    function fetchData(manual = true) {
      if (controller.signal.aborted || request) return request
      clearTimeout(timer)
      if (!manual && document.visibilityState === 'hidden') {
        schedule()
        return undefined
      }
      setLoading(true)
      request = api.get(path, { signal: controller.signal }).then((response) => {
        if (controller.signal.aborted) return
        setResult({ path, data: response.data, updatedAt: new Date().toISOString() })
        setError(null)
      }).catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err))
      }).finally(() => {
        request = null
        if (!controller.signal.aborted) setLoading(false)
        schedule()
      })
      return request
    }

    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') fetchData()
    }
    control.current = fetchData
    fetchData()
    if (interval) document.addEventListener('visibilitychange', refreshOnFocus)
    return () => {
      control.current = null
      controller.abort()
      clearTimeout(timer)
      if (interval) document.removeEventListener('visibilitychange', refreshOnFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, interval, ...deps])

  const current = result?.path === path && enabled ? result : null
  return { data: current?.data ?? null, updatedAt: current?.updatedAt, loading, error, reload }
}
