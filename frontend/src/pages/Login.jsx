import { useLanguage } from '../i18n'
import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeToggle from '../components/ThemeToggle'
import { Logo } from '../components/ui'
import api, { errorMessage } from '../api/client'

const demoOptions = [['range_officer', 'Range Officer']]
const localPreview = import.meta.env.DEV || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)

export default function Login() {
  const { t, errorText } = useLanguage()
  const { token, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [demo, setDemo] = useState({ status: 'loading', accounts: {} })
  const [demoAttempt, setDemoAttempt] = useState(0)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (token) return undefined
    const controller = new AbortController()
    api.get('/api/auth/demo-accounts', { signal: controller.signal, timeout: 5000 })
      .then(({ data }) => {
        if (controller.signal.aborted) return
        if (typeof data?.enabled !== 'boolean' || !data.accounts || typeof data.accounts !== 'object') {
          setDemo({ status: 'unavailable', accounts: {} })
          return
        }
        setDemo(data.enabled
          ? { status: 'enabled', accounts: data.accounts }
          : { status: 'disabled', accounts: {} })
      })
      .catch(() => {
        if (!controller.signal.aborted) setDemo({ status: 'unavailable', accounts: {} })
      })
    return () => controller.abort()
  }, [token, demoAttempt])

  if (token) return <Navigate to="/" replace />

  const submit = async (event, useDemo = false) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(email.trim(), password, useDemo)
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const retryDemoAccounts = () => {
    setDemo({ status: 'loading', accounts: {} })
    setDemoAttempt((attempt) => attempt + 1)
  }
  const showDemo = demo.status === 'enabled' || (localPreview && demo.status !== 'disabled')
  const missingDemoAccount = demoOptions.some(([role]) => !demo.accounts[role])

  return (
    <div className="grid min-h-dvh bg-sand md:grid-cols-[0.85fr_1fr] lg:grid-cols-[1.08fr_1fr]">
      <aside className="relative hidden flex-col justify-between gap-8 overflow-hidden bg-forest-950 p-[clamp(1.5rem,5vh,3.5rem)] md:flex">
        <img
          src="/images/tiger.webp"
          alt={t('Bengal tiger in a forest')}
          className="absolute inset-0 h-full w-full object-cover opacity-[0.72]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-950/20 to-forest-950/65" />
        <div className="relative">
          <Logo light />
        </div>
        <p className="relative font-display text-[clamp(2rem,4vw,3.375rem)] leading-[1.08] tracking-[-0.03em] text-brand-light">
          {t('Protecting forests.')}
          <br />
          {t('Preventing conflict.')}
          <br />
          <span className="text-lime">{t('Saving lives.')}</span>
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
              {t('Field operations sign in')}
            </h1>

            <form onSubmit={submit} className="mt-5 grid gap-3 [@media(max-height:650px)]:mt-3 [@media(max-height:650px)]:gap-2">
              <div>
                <label className="field-label" htmlFor="email">
                  {t('Official email')}
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
                  {t('Password')}
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
                  {errorText(error)}
                </div>
              )}

              <button type="submit" className="btn-primary mt-1 w-full" disabled={submitting}>
                {submitting && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                {submitting ? t('Signing in…') : t('Sign in')}
              </button>
            </form>

            {showDemo && (
              <section aria-labelledby="demo-heading" className="mt-5 border-t border-control-line-7 pt-3 [@media(max-height:650px)]:mt-3 [@media(max-height:650px)]:pt-2">
                <h2 id="demo-heading" className="mb-2 text-xs font-medium text-success-8">{t('Use a demo account')}</h2>
                <div className="grid grid-cols-2 gap-2">
                  {demoOptions.map(([role, name]) => (
                    <button key={role} type="button" onClick={(event) => void submit(event, true)} disabled={submitting || !demo.accounts[role]} className="btn-outline px-2 text-xs">
                      {t(name)}
                    </button>
                  ))}
                </div>
                <div role="status" className="text-xs text-muted-3">
                  {demo.status === 'loading' && <p className="mt-2">{t('Checking demo account availability…')}</p>}
                  {demo.status === 'unavailable' && (
                    <p className="mt-2">
                      {t('Demo accounts are unavailable. Check that the local backend is running with authority demo accounts enabled, then')}{' '}
                      <button type="button" onClick={retryDemoAccounts} className="font-semibold text-success-8 underline">{t('retry')}</button>.
                    </p>
                  )}
                  {demo.status === 'enabled' && missingDemoAccount && (
                    <p className="mt-2">{t('The Greater Noida Range Officer is unavailable.')}</p>
                  )}
                </div>
              </section>
            )}
          </section>

          <Link to="/community" className="mx-auto inline-flex items-center gap-1.5 py-1 text-sm font-semibold text-success-8 hover:underline">
            {t('Village safety portal')} <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </main>
    </div>
  )
}
