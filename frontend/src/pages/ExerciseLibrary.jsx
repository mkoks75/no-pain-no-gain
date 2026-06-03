import { useState, useEffect } from 'react'
import api from '../api/client'

export default function ExerciseLibrary() {
  const [exercises, setExercises] = useState([])
  const [q,        setQ]        = useState('')
  const [location, setLocation] = useState('')
  const [cardio,   setCardio]   = useState('')
  const [loading,  setLoading]  = useState(false)

  useEffect(() => { search() }, [q, location, cardio])

  async function search() {
    setLoading(true)
    const params = {}
    if (q)        params.q        = q
    if (location) params.location = location
    if (cardio !== '') params.cardio = cardio === 'true'
    const { data } = await api.get('/exercises', { params })
    setExercises(data)
    setLoading(false)
  }

  return (
    <div className="page">
      <h2 className="page-title">Oefeningen</h2>

      <div className="filter-bar">
        <input type="search" placeholder="Zoek..."
          value={q} onChange={e => setQ(e.target.value)} className="search-input" />

        <select value={location} onChange={e => setLocation(e.target.value)} className="select-input">
          <option value="">Alle locaties</option>
          <option value="thuis">Thuis</option>
          <option value="sportschool">Sportschool</option>
        </select>

        <select value={cardio} onChange={e => setCardio(e.target.value)} className="select-input">
          <option value="">Alles</option>
          <option value="false">Kracht</option>
          <option value="true">Cardio</option>
        </select>
      </div>

      {loading ? <p className="muted">Laden...</p> : (
        <div className="ex-list">
          {exercises.map(ex => (
            <div key={ex.id} className="ex-item">
              <div className="ex-item-left">
                <strong>{ex.name_nl || ex.name_en}</strong>
                {ex.name_nl && <span className="muted">{ex.name_en}</span>}
                <div className="ex-tags">
                  {ex.muscles_primary?.map(m => (
                    <span key={m} className="ex-chip">{m}</span>
                  ))}
                </div>
              </div>
              <div className="ex-item-right">
                <span className="ex-meta">{ex.category}</span>
                <div className="loc-icons">
                  {ex.available_home && <span title="Thuis">🏠</span>}
                  {ex.available_gym  && <span title="Sportschool">🏋️</span>}
                  {ex.is_cardio      && <span title="Cardio">⚡</span>}
                </div>
              </div>
            </div>
          ))}
          {!exercises.length && <p className="muted">Geen oefeningen gevonden.</p>}
        </div>
      )}
    </div>
  )
}
