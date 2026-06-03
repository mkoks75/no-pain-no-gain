import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'

export default function WorkoutSession() {
  const { dayPlanId }  = useParams()
  const navigate       = useNavigate()

  const [dayPlan,    setDayPlan]    = useState(null)
  const [sessionId,  setSessionId]  = useState(null)
  const [exIdx,      setExIdx]      = useState(0)
  const [setData,    setSetData]    = useState({})  // { exId: [{weight, reps, done}] }
  const [restActive, setRestActive] = useState(false)
  const [restSecs,   setRestSecs]   = useState(90)
  const [restTotal,  setRestTotal]  = useState(90)
  const [finished,   setFinished]   = useState(false)
  const [startTime]  = useState(Date.now())

  const timerRef = useRef(null)

  useEffect(() => {
    loadDay()
    return () => clearInterval(timerRef.current)
  }, [dayPlanId])

  useEffect(() => {
    if (restActive && restSecs > 0) {
      timerRef.current = setInterval(() => setRestSecs(s => {
        if (s <= 1) { clearInterval(timerRef.current); setRestActive(false); return 0 }
        return s - 1
      }), 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [restActive])

  async function loadDay() {
    const { data: day }  = await api.get(`/plans/day/${dayPlanId}`)
    setDayPlan(day)
    // Initialiseer setData vanuit targets
    const initial = {}
    for (const ex of day.exercises || []) {
      const sets = []
      for (let i = 0; i < (ex.target_sets || 4); i++) {
        sets.push({ weight: ex.target_weight || '', reps: ex.target_reps || '', done: false })
      }
      initial[ex.exercise_id] = sets
    }
    setSetData(initial)
    // Start sessie
    const { data: sess } = await api.post('/sessions/', { day_plan_id: Number(dayPlanId) })
    setSessionId(sess.id)
  }

  const exercises    = dayPlan?.exercises || []
  const currentEx    = exercises[exIdx]
  const sets         = currentEx ? (setData[currentEx.exercise_id] || []) : []
  const doneCount    = Object.values(setData).flat().filter(s => s.done).length
  const totalSets    = Object.values(setData).flat().length

  function updateSet(setIdx, field, value) {
    setSetData(prev => {
      const copy = { ...prev }
      copy[currentEx.exercise_id] = copy[currentEx.exercise_id].map((s, i) =>
        i === setIdx ? { ...s, [field]: value } : s
      )
      return copy
    })
  }

  async function checkSet(setIdx) {
    const s     = sets[setIdx]
    const restS = currentEx.rest_sec || 90
    updateSet(setIdx, 'done', true)
    // Log set naar API
    if (sessionId) {
      await api.post(`/sessions/${sessionId}/sets`, {
        exercise_id: currentEx.exercise_id,
        set_number:  setIdx + 1,
        reps:        Number(s.reps) || null,
        weight:      Number(s.weight) || null,
        completed:   true,
      })
    }
    // Start rusttimer (niet na laatste set van laatste oefening)
    const allDone = sets.every((s2, i) => i <= setIdx ? true : s2.done)
    if (!allDone) {
      setRestSecs(restS); setRestTotal(restS); setRestActive(true)
    }
  }

  function addSet() {
    setSetData(prev => ({
      ...prev,
      [currentEx.exercise_id]: [
        ...(prev[currentEx.exercise_id] || []),
        { weight: currentEx.target_weight || '', reps: currentEx.target_reps || '', done: false }
      ]
    }))
  }

  function skipRest() { clearInterval(timerRef.current); setRestActive(false) }
  function addRest(s) { setRestSecs(r => r + s); setRestTotal(t => t + s) }

  async function finishWorkout() {
    if (sessionId) await api.patch(`/sessions/${sessionId}/finish`, { notes: '' })
    setFinished(true)
  }

  const elapsed   = Math.floor((Date.now() - startTime) / 1000)
  const totalVol  = Object.entries(setData).reduce((acc, [, ss]) =>
    acc + ss.filter(s => s.done).reduce((a, s) => a + (Number(s.weight)||0)*(Number(s.reps)||0), 0), 0)

  // ── Afrondscherm ──────────────────────────────────────────────
  if (finished) return (
    <div className="workout-wrap">
      <div className="done-screen">
        <div className="done-check">✅</div>
        <h1 className="done-h">Training klaar!</h1>
        <p className="done-p">Goed gedaan. Je voortgang is opgeslagen.</p>
        <div className="done-stats">
          <div className="done-stat"><div className="v">{exercises.length}</div><div className="l">oefeningen</div></div>
          <div className="done-stat"><div className="v">{totalVol.toLocaleString('nl-NL')}</div><div className="l">kg volume</div></div>
          <div className="done-stat"><div className="v">{Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')}</div><div className="l">tijd</div></div>
        </div>
        <button className="btn-primary" onClick={() => navigate('/')}>Terug naar overzicht</button>
      </div>
    </div>
  )

  if (!dayPlan) return <div className="workout-wrap"><p className="muted">Laden...</p></div>

  const restPct = restTotal > 0 ? (restSecs / restTotal) * 100 : 0
  const circumf = 2 * Math.PI * 100  // r=100

  return (
    <div className="workout-wrap">
      {/* Header */}
      <div className="wo-header">
        <div className="wo-header-left">
          <div className="wo-title">
            {dayPlan.location === 'thuis' ? 'Thuis' : 'Sportschool'} · {
              currentEx?.is_cardio ? 'Conditie' : 'Kracht'
            }
          </div>
          <div className="wo-sub">
            Oefening {exIdx+1} van {exercises.length} · {doneCount}/{totalSets} sets
          </div>
        </div>
        <button className="wo-close" onClick={() => { if (confirm('Sessie beëindigen?')) finishWorkout() }}>✕</button>
      </div>

      {/* Voortgangsbalk */}
      <div className="pbar">
        {exercises.map((ex, i) => {
          const exSets  = setData[ex.exercise_id] || []
          const isDone  = exSets.length > 0 && exSets.every(s => s.done)
          const isActive = i === exIdx
          const donePct = exSets.length > 0 ? exSets.filter(s => s.done).length / exSets.length * 100 : 0
          return (
            <div key={ex.id} className={`pseg ${isDone ? 'done' : isActive ? 'active' : ''}`}
              style={isActive && donePct > 0 ? { '--p': `${donePct}%` } : {}} />
          )
        })}
      </div>

      {/* Body oefening */}
      <div className="wo-body">
        {currentEx && (
          <>
            <div className={`ex-tag ${currentEx.is_cardio ? 'cardio' : ''}`}>
              {currentEx.is_cardio ? '⚡ Conditieblok' : '🏋️ Krachttraining'} · {dayPlan.location}
            </div>
            {currentEx.image_url && (
              <img
                src={currentEx.image_url.startsWith('/uploads') ? `/api${currentEx.image_url}` : currentEx.image_url}
                className="wo-ex-thumb"
                alt=""
              />
            )}
            <h1 className="ex-name">{currentEx.name_nl || currentEx.name_en}</h1>
            <p className="ex-meta">{currentEx.muscles_primary?.[0] || currentEx.category}</p>
            {currentEx.custom_description && (
              <details className="ex-desc">
                <summary>Beschrijving / techniek</summary>
                <p>{currentEx.custom_description}</p>
              </details>
            )}

            {!currentEx.is_cardio ? (
              <>
                <div className="ex-target">
                  <div className="t"><div className="t-lbl">Doel</div><div className="t-val">{currentEx.target_sets}×{currentEx.target_reps}</div></div>
                  <div className="t"><div className="t-lbl">Gewicht</div><div className="t-val">{currentEx.target_weight ? `${currentEx.target_weight} kg` : '—'}</div></div>
                  <div className="t"><div className="t-lbl">Rust</div><div className="t-val">{currentEx.rest_sec}s</div></div>
                </div>

                <div className="sets-table">
                  <div className="sets-h">
                    <div>Set</div><div>Kg</div><div>Reps</div><div></div>
                  </div>
                  {sets.map((s, i) => (
                    <div key={i} className={`set-row ${s.done ? 'done' : ''}`}>
                      <div className="set-no">{i+1}</div>
                      <input className="set-input" type="number" inputMode="decimal"
                        value={s.weight}
                        onChange={e => updateSet(i, 'weight', e.target.value)}
                        disabled={s.done}
                      />
                      <input className="set-input" type="number" inputMode="numeric"
                        value={s.reps}
                        onChange={e => updateSet(i, 'reps', e.target.value)}
                        disabled={s.done}
                      />
                      <button className="set-check" disabled={s.done} onClick={() => checkSet(i)}>
                        {s.done ? '✓' : '○'}
                      </button>
                    </div>
                  ))}
                </div>
                <button className="add-set" onClick={addSet}>+ Set toevoegen</button>
              </>
            ) : (
              <div className="cardio-card">
                <div className="cardio-lbl">Doelduur</div>
                <div className="cardio-big">{currentEx.target_time_sec
                  ? `${Math.floor(currentEx.target_time_sec/60)} min`
                  : '20-30 min'}</div>
                <button className="btn-primary" style={{marginTop:'1.5rem'}}
                  onClick={() => checkSet(0)}>
                  Cardio voltooid ✓
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Rusttimer overlay */}
      {restActive && (
        <div className="rest-overlay">
          <div className="rest-label">Rust</div>
          <div className="rest-ring-wrap">
            <svg width="220" height="220" viewBox="0 0 220 220">
              <circle className="rest-bg" cx="110" cy="110" r="100" />
              <circle className="rest-fg" cx="110" cy="110" r="100"
                strokeDasharray={circumf}
                strokeDashoffset={circumf * (1 - restPct/100)}
                transform="rotate(-90 110 110)"
              />
            </svg>
            <div className="rest-time">
              {Math.floor(restSecs/60)}:{String(restSecs%60).padStart(2,'0')}
            </div>
          </div>
          <div className="rest-btns">
            <button className="rest-btn" onClick={() => addRest(15)}>+15s</button>
            <button className="rest-btn skip" onClick={skipRest}>Sla over →</button>
          </div>
        </div>
      )}

      {/* Onderbalk */}
      <div className="wo-footer">
        <button className="btn-nav" disabled={exIdx === 0} onClick={() => setExIdx(i => i-1)}>← Vorige</button>
        {exIdx < exercises.length - 1 ? (
          <button className="btn-nav next" onClick={() => setExIdx(i => i+1)}>Volgende →</button>
        ) : (
          <button className="btn-nav finish" onClick={finishWorkout}>Training afronden ✓</button>
        )}
      </div>
    </div>
  )
}
