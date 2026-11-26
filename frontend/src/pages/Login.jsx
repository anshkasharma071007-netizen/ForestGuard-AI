import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeToggle from '../components/ThemeToggle'
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
    <div className="grid min-h-dvh bg-sand md:grid-cols-[0.85fr_1fr] lg:grid-cols-[1.08fr_1fr]">
      <aside className="relative hidden flex-col justify-between gap-8 overflow-hidden bg-forest-950 p-[clamp(1.5rem,5vh,3.5rem)] md:flex">
        <img
          src="/images/tiger.webp"
          alt="Bengal tiger in a forest"
          className="absolute inset-0 h-full w-full object-cover opacity-[0.72]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-950/20 to-forest-950/65" />
        <div className="relative">
          <Logo light />
        </div>
        <p className="relative font-display text-[clamp(2rem,4vw,3.375rem)] leading-[1.08] tracking-[-0.03em] text-brand-light">
          Protecting forests.
          <br />
          Preventing conflict.
          <br />
          <span className="text-lime">Saving lives.</span>
        </p>
      </aside>

      <main className="flex min-w-0 flex-col px-4 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-control-line-7 py-3 md:justify-end md:border-0">
          <div className="md:hidden">
            <Logo />
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-[26rem] flex-1 content-center gap-4 py-4 sm:py-6 [@media(max-height:650px)]:gap-2 [@media(max-height:650px)]:py-2">
          <section aria-labelledby="login-heading" className="rounded-2xl border border-control-line-7 bg-raised p-5 shadow-sm sm:p-7 [@media(max-height:650px)]:p-4">
            <h1 id="login-heading" className="font-display text-[28px] leading-tight tracking-tight text-ink sm:text-[32px]">
              Field operations sign in
            </h1>

            <form onSubmit={submit} className="mt-5 grid gap-3 [@media(max-height:650px)]:mt-3 [@media(max-height:650px)]:gap-2">
              <div>
                <label className="field-label" htmlFor="email">
                  Official email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  className="field"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="field"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              {error && (
                <div role="alert" className="break-words rounded-xl border border-danger-line-1 bg-danger-surface-3 px-3 py-2 text-xs leading-relaxed text-danger-2">
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary mt-1 w-full" disabled={submitting}>
                {submitting && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="mt-5 border-t border-control-line-7 pt-3 [@media(max-height:650px)]:mt-3 [@media(max-height:650px)]:pt-2">
              <p className="mb-2 text-xs font-medium text-success-8">Use a demo account</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => fill('admin')} className="btn-outline px-2 text-xs">
                  Range officer
                </button>
                <button type="button" onClick={() => fill('guard')} className="btn-outline px-2 text-xs">
                  Forest guard
                </button>
              </div>
            </div>
          </section>

          <Link to="/community" className="mx-auto inline-flex items-center gap-1.5 py-1 text-sm font-semibold text-success-8 hover:underline">
            Village safety portal <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </main>
    </div>
  )
}
