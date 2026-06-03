import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts'
import api from '../api/client'

export default function Progress() {
  const [overview, setOverview]   = useState(null)
  const [weekly,   setWeekly]     = useState(null)
  const [exList,   setExList]     = useState([])
  const [selEx,    setSelEx]      = useState('')
  const [exProg,   setExProg]     = useState([])

  useEffect(() => {
    api.get('/progress/overview').then(r => setOverview(r.data))
    api.get('/progress/weekly').then(r => setWeekly(r.data))
    api.get('/exercises/', { params: { cardio: false } }).then(r => setExList(r.data))
  }, [])

  useEffect(() => {
    if (!selEx) return
    api.get(`/progress/exercise/${selEx}`).then(r => setExProg(r.data))
  }, [selEx])

  return (
    <div className="page">
      <h2 className="page-title">Voortgang</h2>

      {/* Overzichtkaarten */}
      {overview && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-val">{overview.total_sessions}</div>
            <div className="stat-lbl">Trainingen totaal</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{overview.sessions_last_30d}</div>
            <div className="stat-lbl">Afgelopen 30 dagen</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{Math.round(overview.total_volume_kg).toLocaleString('nl-NL')}</div>
            <div className="stat-lbl">kg volume totaal</div>
          </div>
        </div>
      )}

      {/* Weekvolume vs doel */}
      {weekly?.groups?.length > 0 && (
        <section className="section">
          <h3 className="section-title">
            Spiergroepen deze week ({weekly.week_start} → {weekly.week_end})
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekly.groups} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="muscle_group" tick={{ fill: '#8b97a5', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8b97a5', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1a2129', border: '1px solid #2e3a47', borderRadius: 8 }}
                labelStyle={{ color: '#eef3f8' }}
              />
              <Bar dataKey="target" name="Doel"  fill="#2e3a47" radius={[4,4,0,0]} />
              <Bar dataKey="done"   name="Gedaan" fill="#4ade80" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* Oefening progressie */}
      <section className="section">
        <h3 className="section-title">Progressie per oefening</h3>
        <select
          className="select-input"
          value={selEx}
          onChange={e => setSelEx(e.target.value)}
        >
          <option value="">Kies een oefening...</option>
          {exList.map(ex => (
            <option key={ex.id} value={ex.id}>{ex.name_nl || ex.name_en}</option>
          ))}
        </select>

        {selEx && exProg.length > 0 && (
          <ResponsiveContainer width="100%" height={220} style={{ marginTop: '1rem' }}>
            <LineChart data={exProg} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#2e3a47" strokeDasharray="3 3" />
              <XAxis dataKey="datum" tick={{ fill: '#8b97a5', fontSize: 10 }}
                tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: '#8b97a5', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1a2129', border: '1px solid #2e3a47', borderRadius: 8 }}
                labelStyle={{ color: '#eef3f8' }}
              />
              <Line dataKey="max_weight" name="Max kg" stroke="#4ade80" dot={{ r: 3 }} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {selEx && exProg.length === 0 && (
          <p className="muted" style={{ marginTop:'1rem' }}>Nog geen gelogde sessies voor deze oefening.</p>
        )}
      </section>
    </div>
  )
}
