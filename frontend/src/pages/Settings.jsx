import { useEffect, useState } from 'react'
import api, { errorMessage } from '../api/client'
import ThemeToggle from '../components/ThemeToggle'
import { ErrorBox, Loading, PageHeader, SectionTitle } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'
import { titleCase } from '../utils/format'

const fields = [
  ['alert_threshold', 'Automated alert trigger score', 0, 100, 1],
  ['alert_radius_km', 'Village alert radius (km)', 0.2, 25, 0.1],
  ['influence_radius_km', 'Risk influence radius (km)', 0.5, 30, 0.1],
  ['moderate', 'Moderate risk threshold', 0, 100, 1],
  ['high', 'High risk threshold', 0, 100, 1],
]

export default function Settings() {
  const { user, isAdmin, logout } = useAuth()
  const config = useApi('/api/risk/config')
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    const settings = config.data?.settings
    if (settings) setForm({ ...settings, ...settings.thresholds })
  }, [config.data])

  async function save(event, reset = false) {
    event.preventDefault()
    if (busy || !isAdmin) return
    if (reset && !window.confirm('Restore default risk settings and recalculate scores?')) return
    setBusy(true)
    setFeedback(null)
    try {
      const result = reset ? await api.post('/api/risk/config/reset') : await api.patch('/api/risk/config', {
        alert_threshold: Number(form.alert_threshold),
        alert_radius_km: Number(form.alert_radius_km),
        influence_radius_km: Number(form.influence_radius_km),
        thresholds: { moderate: Number(form.moderate), high: Number(form.high) },
      })
      const { settings } = result.data
      setForm({ ...settings, ...settings.thresholds })
      setFeedback({ message: 'Risk settings saved and scores recalculated.' })
      config.reload()
    } catch (error) {
      setFeedback({ error: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  return <>
    <PageHeader title="Settings" />
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <section className="card space-y-3 p-5">
          <SectionTitle title="Authority account" />
          <dl className="space-y-2 text-sm">
            <div><dt className="text-muted-3">Name</dt><dd>{user?.name}</dd></div>
            <div><dt className="text-muted-3">Email</dt><dd>{user?.email}</dd></div>
            <div><dt className="text-muted-3">Role</dt><dd>{titleCase(user?.role)}</dd></div>
          </dl>
          <button type="button" className="btn-outline" onClick={logout}>Sign out</button>
        </section>
        <section className="card flex items-center justify-between p-5">
          <SectionTitle title="Appearance" subtitle="Switch between light and dark themes." />
          <ThemeToggle />
        </section>
      </div>
      <section className="card space-y-4 p-5">
        <SectionTitle title="Risk configuration" subtitle={isAdmin ? 'Changes apply across the deployment.' : 'Only administrators can edit these settings.'} />
        {config.error && <ErrorBox message={config.error} onRetry={config.reload} />}
        {!form && config.loading && <Loading />}
        {form && <form className="space-y-3" onSubmit={save}>
          <fieldset disabled={!isAdmin || busy} className="space-y-3">
            {fields.map(([key, label, min, max, step]) => <label className="field-label block" key={key}>{label}
              <input className="field mt-1" type="number" min={min} max={max} step={step} required value={form[key]}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
            </label>)}
            {isAdmin && <div className="flex gap-2">
              <button type="submit" className="btn-primary">{busy ? 'Saving…' : 'Save and recalculate'}</button>
              <button type="button" className="btn-outline" onClick={(event) => save(event, true)}>Restore defaults</button>
            </div>}
          </fieldset>
        </form>}
        {feedback?.error && <ErrorBox message={feedback.error} />}
        {feedback?.message && <p role="status" className="text-sm text-success-7">{feedback.message}</p>}
      </section>
    </div>
  </>
}
