import { useEffect, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function EvidenceImage({ path, fallback, ...props }) {
  const { token } = useAuth()
  const [image, setImage] = useState(null)
  useEffect(() => {
    if (!token || !path?.startsWith('/api/')) return
    const controller = new AbortController()
    let url
    api.get(path, { responseType: 'blob', signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return
      url = URL.createObjectURL(data)
      setImage({ path, token, url })
    }).catch(() => {})
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [path, token])
  const src = image?.path === path && image.token === token ? image.url : fallback
  return src ? <img {...props} src={src} /> : null
}
