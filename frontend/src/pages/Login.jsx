import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, KeyRound, Loader2, LockKeyhole, ShieldCheck, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Logo } from '../components/ui'
import { errorMessage } from '../api/client'

export default function Login() {
  const { token, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('admin@forestguard.ai')
  const [password, setPassword] = useState('forest123')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (token) return <Navigate to="/" replace />

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(email.trim(), password)
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const fill = (role) => {
    if (role === 'admin') {
      setEmail('admin@forestguard.ai')
      setPassword('forest123')
    } else {
      setEmail('guard@forestguard.ai')
      setPassword('guard123')
    }
  }

  return (
    <div className="flex min-h-screen bg-sand">
      <div className="relative hidden w-[56%] overflow-hidden bg-forest-950 lg:block">
        <img
          src="/images/tiger.webp"
          alt="Bengal tiger in a forest"
          className="absolute inset-0 h-full w-full object-cover opacity-[0.72]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-950/45 to-forest-950/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-forest-950/75 via-transparent to-transparent" />
        <div className="grain absolute inset-0" />
        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          <Logo light />
          <div className="max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-lime">
              <span className="h-1.5 w-1.5 rounded-full bg-lime" />
              Conservation intelligence platform
            </div>
            <h1 className="font-display text-[46px] leading-[1.03] tracking-[-0.03em] text-parchment xl:text-[54px]">
              Protecting forests.
              <br />
              Preventing conflict.
              <br />
              <span className="text-lime">Saving lives.</span>
            </h1>
            <p className="mt-5 max-w-md text-[13.5px] leading-relaxed text-forest-100/70">
              An AI-assisted monitoring ecosystem that connects wildlife, forest authorities and
              buffer-zone communities — turning camera observations into explainable, geospatial
              early warning.
            </p>
            <div className="mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-white/10 pt-6">
              {[
                ['Detect', 'YOLO-World + CLIP'],
                ['Map', 'GIS risk intelligence'],
                ['Protect', 'Guard + village alerts'],
              ].map(([title, detail]) => (
                <div key={title}>
                  <div className="font-display text-[19px] text-parchment">{title}</div>
                  <div className="mt-1 text-[10px] leading-snug text-forest-200/55">{detail}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-forest-200/45">
            <ShieldCheck className="h-3.5 w-3.5 text-lime/70" />
            Illustrative Pench landscape · demonstration prototype
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-10 lg:w-[44%] lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <div className="eyebrow">Authorised access</div>
          <h2 className="mt-2 font-display text-[32px] leading-tight tracking-[-0.02em] text-ink">
            Field operations sign in
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[#727b71]">
            Range officers and forest guards can access detections, risk intelligence and alert
            response tools. Community members do not need an account.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <label className="field-label" htmlFor="email">
                Official email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-[#9a998e]" />
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  className="field pl-10"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-[#9a998e]" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="field pl-10"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-[#e6b9ac] bg-[#fbf0ec] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[#8b3524]">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {submitting ? 'Signing in…' : 'Enter operations console'}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-[#e0dacb] bg-parchment p-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d938a]">
                Demo credentials
              </div>
              <span className="rounded-full bg-[#f3e9cd] px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.1em] text-[#8a671e]">
                Prototype only
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => fill('admin')} className="rounded-xl border border-[#ddd6c6] bg-white px-3 py-2 text-left transition hover:border-forest-400">
                <div className="text-[11px] font-semibold text-ink">Range officer</div>
                <div className="mt-0.5 font-mono text-[9px] text-[#8b9088]">admin@forestguard.ai</div>
                <div className="font-mono text-[9px] text-[#8b9088]">forest123</div>
              </button>
              <button type="button" onClick={() => fill('guard')} className="rounded-xl border border-[#ddd6c6] bg-white px-3 py-2 text-left transition hover:border-forest-400">
                <div className="text-[11px] font-semibold text-ink">Forest guard</div>
                <div className="mt-0.5 font-mono text-[9px] text-[#8b9088]">guard@forestguard.ai</div>
                <div className="font-mono text-[9px] text-[#8b9088]">guard123</div>
              </button>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between text-[11px]">
            <Link to="/community" className="inline-flex items-center gap-1.5 font-semibold text-forest-600 hover:underline">
              Village safety portal <ArrowRight className="h-3 w-3" />
            </Link>
            <span className="text-[#9a998e]">v1.0 · demo</span>
          </div>
        </div>
      </div>
    </div>
  )
}
