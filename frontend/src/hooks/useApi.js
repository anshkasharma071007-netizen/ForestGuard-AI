import { useEffect, useRef, useState } from 'react'
import api, { errorMessage } from '../api/client'

export function useApi(path, { deps = [], enabled = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled && path))
  const [error, setError] = useState(null)
  const [nonce, setNonce] = useState(0)
  const latest = useRef(0)

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false)
      return undefined
    }
    const requestId = latest.current + 1
    latest.current = requestId
    let active = true
    setLoading(true)
    setError(null)
    api
      .get(path)
      .then((response) => {
        if (active && requestId === latest.current) setData(response.data)
      })
      .catch((err) => {
        if (active && requestId === latest.current) setError(errorMessage(err))
      })
      .finally(() => {
        if (active && requestId === latest.current) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, nonce, ...deps])

  return { data, loading, error, reload: () => setNonce((value) => value + 1), setData }
}
