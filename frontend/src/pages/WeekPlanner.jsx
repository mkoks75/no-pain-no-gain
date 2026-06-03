import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'

const DAYS_OF_WEEK = [
  { label: 'Maandag',   offset: 0 },
  { label: 'Dinsdag',   offset: 1 },
  { label: 'Woensdag',  offset: 2 },
  { label: 'Donderdag', offset: 3 },
  { label: 'Vrijdag',   offset: 4 },
  { label: 'Zaterdag',  offset: 5 },
  { label: 'Zondag',    offset: 6 },
]

function addDays(base, n) {
  const d = new Date(base + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function WeekPlanner() {
  const { weekStart } = useParams()
  const navigate       = useNavigate()

  // Beschikbaarheid per dag: { offset: { active, location } }
  const [avail, setAvail]     = useState(() =>
    Object.fromEntries(DAYS_OF_WEEK.map(d => [d.offset, { active: false, location: 'thuis' }]))
  )
  const [plan,  setPlan]      = useState(null)
  const [busy,  setBusy]      = useState(false)
  const [loading, setLoading] = useState(true)
  const [err,   setErr]       = useState('')

  // Zoekmodal voor oefening wisselen
  const [swapTarget,  setSwapTarget]  = useState(null)  // { day, planExId }
  const [searchQ,     setSearchQ]     = useState('')
  const [searchResults, setSearchResults] = useState([])

  useEffect(() => { fetchPlan() }, [weekStart])

  async function fetchPlan() {
    setLoading(true)
    try {
      const { data } = await api.get('/plans/week', { params: { week_start: weekStart } })
      if (data) {
        setPlan(data)
        // Herstel beschikbaarheid vanuit plan
        const newAvail = Object.fromEntries(
          DAYS_OF_WEEK.map(d => [d.offset, { active: false, location: 'thuis' }])
        )
        data.days?.forEach(day => {
          const d    = new Date(day.date + 'T00:00:00')
          const dow  = d.getDay()
          const off  = dow === 0 ? 6 : dow - 1
          newAvail[off] = { active: true, location: day.location }
        })
        setAvail(newAvail)
      }
    } catch { /* geen plan */ }
    finally { setLoading(false) }
  }

  async function handleGenerate() {
    const days = DAYS_OF_WEEK
      .filter(d => avail[d.offset].active)
      .map(d => ({ date: addDays(weekStart, d.offset), location: avail[d.offset].location }))

    if (!days.length) { setErr('Selecteer minimaal één trainingsdag.'); return }
    setErr(''); setBusy(true)
    try {
      await api.post('/plans/generate', { week_start: weekStart, days })
      await fetchPlan()
    } catch (ex) { setErr(ex.response?.data?.detail || 'Genereren mislukt') }
    finally { setBusy(false) }
  }

  async function removeExercise(planExId) {
    await api.delete(`/plans/exercise/${planExId}`)
    await fetchPlan()
  }

  async function updateTarget(planExId, field, value) {
    await api.patch(`/plans/exercise/${planExId}`, { [field]: Number(value) })
    await fetchPlan()
  }

  async function searchExercises(q) {
    setSearchQ(q)
    if (!q) { setSearchResults([]); return }
    const { data } = await api.get('/exercises', { params: { q } })
    setSearchResults(data)
  }

  async function swapExercise(newExId) {
    if (!swapTarget) return
    // Verwijder oude, voeg nieuwe toe
    const day = plan.days.find(d => d.exercises?.some(e => e.id === swapTarget.planExId))
    if (!day) return
    await api.delete(`/plans/exercise/${swapTarget.planExId}`)
    await api.post(`/plans/day/${day.id}/exercises`, {
      exercise_id: newExId, block_type: 'strength',
      target_sets: 4, target_reps: 10, rest_sec: 90,
    })
    setSwapTarget(null); setSearchQ(''); setSearchResults([])
    await fetchPlan()
  }

  if (loading) return <div className="page"><p className="muted">Laden...</p></div>

  return (
    <div className="page">
      <div className="page-header">
        <button className="icon-btn" onClick={() => navigate('/')}>←</button>
        <h2>Plan — week van {weekStart}</h2>
      </div>

      {/* Beschikbaarheid */}
      <section className="section">
        <h3 className="section-title">Beschikbaarheid invullen</h3>
        <div className="avail-grid">
          {DAYS_OF_WEEK.map(day => (
            <div key={day.offset} className={`avail-row ${avail[day.offset].active ? 'active' : ''}`}>
              <label className="avail-check">
                <input
                  type="checkbox"
                  checked={avail[day.offset].active}
                  onChange={e => setAvail(a => ({ ...a, [day.offset]: { ...a[day.offset], active: e.target.checked } }))}
                />
                <span>{day.label}</span>
              </label>
              {avail[day.offset].active && (
                <div className="loc-toggle">
                  <button
                    className={`loc-btn ${avail[day.offset].location === 'thuis' ? 'sel' : ''}`}
                    onClick={() => setAvail(a => ({ ...a, [day.offset]: { ...a[day.offset], location: 'thuis' } }))}
                  >Thuis</button>
                  <button
                    className={`loc-btn ${avail[day.offset].location === 'sportschool' ? 'sel' : ''}`}
                    onClick={() => setAvail(a => ({ ...a, [day.offset]: { ...a[day.offset], location: 'sportschool' } }))}
                  >Sportschool</button>
                </div>
              )}
            </div>
          ))}
        </div>
        {err && <p className="form-err">{err}</p>}
        <button className="btn-primary" onClick={handleGenerate} disabled={busy}>
          {busy ? 'Bezig...' : plan ? 'Opnieuw genereren' : 'Plan genereren'}
        </button>
      </section>

      {/* Gegenereerd plan */}
      {plan?.days?.map(day => (
        <section key={day.id} className="section">
          <div className="day-plan-header">
            <h3>{new Date(day.date + 'T00:00:00').toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'short' })}</h3>
            <span className={`location-badge ${day.location}`}>{day.location}</span>
          </div>

          {day.exercises?.map(ex => (
            <div key={ex.id} className="plan-ex-row">
              <div className="plan-ex-name">
                <strong>{ex.name_nl || ex.name_en}</strong>
                <span className="muted">{ex.muscles_primary?.[0]}</span>
              </div>
              <div className="plan-ex-targets">
                <label>Sets
                  <input type="number" min={1} max={10}
                    defaultValue={ex.target_sets}
                    onBlur={e => updateTarget(ex.id, 'target_sets', e.target.value)}
                  />
                </label>
                <label>Reps
                  <input type="number" min={1} max={30}
                    defaultValue={ex.target_reps}
                    onBlur={e => updateTarget(ex.id, 'target_reps', e.target.value)}
                  />
                </label>
                <label>Rust(s)
                  <input type="number" min={30} max={300} step={15}
                    defaultValue={ex.rest_sec}
                    onBlur={e => updateTarget(ex.id, 'rest_sec', e.target.value)}
                  />
                </label>
              </div>
              <div className="plan-ex-actions">
                <button className="icon-btn-sm" title="Wissel oefening"
                  onClick={() => setSwapTarget({ planExId: ex.id })}>↔</button>
                <button className="icon-btn-sm danger" title="Verwijder"
                  onClick={() => removeExercise(ex.id)}>✕</button>
              </div>
            </div>
          ))}

          <button className="btn-ghost" onClick={() => setSwapTarget({ dayId: day.id, isNew: true })}>
            + Oefening toevoegen
          </button>
        </section>
      ))}

      {plan && (
        <button className="btn-primary" onClick={() => navigate('/')}>
          Klaar — terug naar dashboard
        </button>
      )}

      {/* Swap/Zoek modal */}
      {swapTarget && (
        <div className="modal-overlay" onClick={() => setSwapTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Oefening {swapTarget.isNew ? 'toevoegen' : 'wisselen'}</h3>
            <input
              type="search"
              placeholder="Zoek oefening..."
              value={searchQ}
              onChange={e => searchExercises(e.target.value)}
              autoFocus
              className="search-input"
            />
            <div className="search-results">
              {searchResults.map(ex => (
                <button key={ex.id} className="search-result-item"
                  onClick={async () => {
                    if (swapTarget.isNew) {
                      await api.post(`/plans/day/${swapTarget.dayId}/exercises`, {
                        exercise_id: ex.id, block_type: 'strength',
                        target_sets: 4, target_reps: 10, rest_sec: 90,
                      })
                      setSwapTarget(null); setSearchQ(''); setSearchResults([])
                      fetchPlan()
                    } else {
                      await swapExercise(ex.id)
                    }
                  }}
                >
                  <strong>{ex.name_nl || ex.name_en}</strong>
                  <span className="muted">{ex.muscles_primary?.[0]} · {ex.available_home ? '🏠' : ''}{ex.available_gym ? '🏋️' : ''}</span>
                </button>
              ))}
            </div>
            <button className="btn-ghost" onClick={() => setSwapTarget(null)}>Annuleren</button>
          </div>
        </div>
      )}
    </div>
  )
}
