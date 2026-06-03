import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

function getMonday(d = new Date()) {
  const dt = new Date(d)
  const day = dt.getDay()
  dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1))
  dt.setHours(0, 0, 0, 0)
  return dt
}

function toISO(d) {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const WEEKDAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

export default function Dashboard() {
  const navigate  = useNavigate()
  const [monday,  setMonday]  = useState(getMonday())
  const [plan,    setPlan]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchPlan() }, [monday])

  async function fetchPlan() {
    setLoading(true)
    try {
      const { data } = await api.get('/plans/week', { params: { week_start: toISO(monday) } })
      setPlan(data)
    } catch { setPlan(null) }
    finally { setLoading(false) }
  }

  function prevWeek() { setMonday(d => { const n = new Date(d); n.setDate(n.getDate()-7); return n }) }
  function nextWeek() { setMonday(d => { const n = new Date(d); n.setDate(n.getDate()+7); return n }) }

  const isThisWeek = toISO(getMonday()) === toISO(monday)

  return (
    <div className="page">
      <div className="week-nav">
        <button className="icon-btn" onClick={prevWeek}>←</button>
        <span className="week-label">
          {isThisWeek ? 'Deze week' : `Week van ${toISO(monday)}`}
        </span>
        <button className="icon-btn" onClick={nextWeek}>→</button>
      </div>

      {loading ? (
        <p className="muted">Laden...</p>
      ) : !plan ? (
        <div className="empty-state">
          <p>Nog geen plan voor deze week.</p>
          <button className="btn-primary" onClick={() => navigate(`/plan/${toISO(monday)}`)}>
            Plan aanmaken
          </button>
        </div>
      ) : (
        <>
          <div className="day-grid">
            {plan.days?.map(day => {
              const d    = new Date(day.date + 'T00:00:00')
              const dow  = d.getDay()
              const label = WEEKDAYS[(dow === 0 ? 6 : dow - 1)]
              const isToday = toISO(new Date()) === day.date
              return (
                <div
                  key={day.id}
                  className={`day-card ${isToday ? 'today' : ''}`}
                  onClick={() => navigate(`/workout/${day.id}`)}
                >
                  <div className="day-card-top">
                    <span className="day-label">{label}</span>
                    <span className={`location-badge ${day.location}`}>{day.location}</span>
                  </div>
                  <div className="day-exercises">
                    {day.exercises?.slice(0, 4).map(ex => (
                      <span key={ex.id} className="ex-chip">
                        {ex.name_nl || ex.name_en}
                      </span>
                    ))}
                    {(day.exercises?.length ?? 0) > 4 && (
                      <span className="ex-chip muted">+{day.exercises.length - 4} meer</span>
                    )}
                    {!day.exercises?.length && <span className="muted">Geen oefeningen</span>}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="plan-actions">
            <button className="btn-secondary" onClick={() => navigate(`/plan/${toISO(monday)}`)}>
              Plan bewerken
            </button>
          </div>
        </>
      )}
    </div>
  )
}
