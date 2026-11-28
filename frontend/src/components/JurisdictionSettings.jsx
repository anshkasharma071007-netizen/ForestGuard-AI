import { useLanguage } from '../i18n'
import { useState } from 'react'
import api, { errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { ErrorBox, SectionTitle } from './ui'

function selectedIds(form) {
  return new FormData(form).getAll('jurisdiction').map(Number)
}

function JurisdictionsField({ items, assigned = [] }) {
  const { t } = useLanguage()
  return <fieldset className="space-y-1">
    <legend className="field-label">{t('Assigned jurisdictions')}</legend>
    {items.map(item => <label key={item.id} className="flex items-center gap-2 text-sm">
      <input name="jurisdiction" type="checkbox" value={item.id} defaultChecked={assigned.includes(item.id)} />
      {item.name}{item.is_demo ? t(' (Demo)') : ''}
    </label>)}
    {!items.length && <p className="text-sm">{t('No jurisdictions configured.')}</p>}
  </fieldset>
}

export default function JurisdictionSettings() {
  const { t } = useLanguage()
  const jurisdictions = useApi('/api/authority/jurisdictions')
  const officers = useApi('/api/authority/officers')
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const items = jurisdictions.data?.items ?? []
  const selected = officers.data?.items.find(item => String(item.id) === selectedId)

  async function save(event, action) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const values = new FormData(form)
    const jurisdiction_ids = selectedIds(form)
    setBusy(true)
    setFeedback(null)
    try {
      if (action === 'boundary') {
        let boundary
        try { boundary = JSON.parse(values.get('boundary')) }
        catch { throw new Error('Enter valid GeoJSON for the jurisdiction boundary.') }
        await api.post('/api/authority/jurisdictions', {
          name: values.get('name'), priority: Number(values.get('priority')), boundary,
        })
        await jurisdictions.reload()
      } else {
        if (selected) await api.put(`/api/authority/officers/${selected.id}/jurisdictions`, { jurisdiction_ids })
        else await api.post('/api/authority/officers', {
          name: values.get('name'), email: values.get('email'), password: values.get('password'),
          role: values.get('role'), jurisdiction_ids,
        })
        await officers.reload()
      }
      if (action === 'boundary' || !selected) form.reset()
      setFeedback({ message: action === 'boundary' ? 'Jurisdiction created.' : 'Officer assignments saved.' })
    } catch (error) {
      setFeedback({ error: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  return <section className="operations-panel mt-4 space-y-4 p-4">
    <SectionTitle title={t('Jurisdictions and authority assignments')} />
    {(jurisdictions.error || officers.error) && <ErrorBox message={jurisdictions.error || officers.error} />}
    {feedback?.error && <ErrorBox message={feedback.error} />}
    {feedback?.message && <p role="status" className="text-sm text-success-7">{t(feedback.message)}</p>}
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-3" onSubmit={event => save(event, 'boundary')}>
        <h3 className="font-medium">{t('Create jurisdiction')}</h3>
        <label className="field-label block">{t('Name')}<input className="field mt-1" name="name" required maxLength={120} /></label>
        <label className="field-label block">{t('Priority in overlapping areas')}
          <input className="field mt-1" name="priority" type="number" min={0} max={10000} defaultValue={100} required />
          <span className="text-xs">{t('Lower numbers take priority for new assignments.')}</span>
        </label>
        <label className="field-label block">{t('Boundary GeoJSON')}
          <textarea className="field mt-1 font-mono" name="boundary" rows={4} placeholder={t('Paste a Polygon or MultiPolygon')} required />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>{t('Create jurisdiction')}</button>
      </form>
      <div className="space-y-3">
        <label className="field-label block">{t('Authority account')}
          <select className="field mt-1" value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={busy}>
            <option value="">{t('Create authority account')}</option>
            {officers.data?.items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}
          </select>
        </label>
        <form className="space-y-3" key={selectedId} onSubmit={event => save(event, 'officer')}>
          {!selected && <>
            <label className="field-label block">{t('Name')}<input className="field mt-1" name="name" required maxLength={120} /></label>
            <label className="field-label block">{t('Email')}<input className="field mt-1" name="email" type="email" required /></label>
            <label className="field-label block">{t('Password')}<input className="field mt-1" name="password" type="password"
              autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            <label className="field-label block">{t('Role')}<select className="field mt-1" name="role">
              <option value="range_officer">{t('Range officer')}</option><option value="guard">{t('Forest guard')}</option>
            </select></label>
          </>}
          <JurisdictionsField items={items} assigned={selected?.jurisdiction_ids} />
          <button type="submit" className="btn-primary" disabled={busy || !jurisdictions.data || !officers.data}>
            {selected ? t('Save assignments') : t('Create account')}
          </button>
        </form>
      </div>
    </div>
  </section>
}
