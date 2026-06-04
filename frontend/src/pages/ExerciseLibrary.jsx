import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../store/auth'
import api from '../api/client'

function imgUrl(url) {
  if (!url) return null
  if (url.startsWith('/uploads')) return `/api${url}`
  return url
}

const STATUS_LABEL = { favoriet: 'Favoriet', actief: 'Actief', inactief: 'Inactief' }

const MUSCLES = [
  { label: 'Borst',      value: 'Chest' },
  { label: 'Rug',        value: 'Lats' },
  { label: 'Schouders',  value: 'Shoulders' },
  { label: 'Biceps',     value: 'Biceps' },
  { label: 'Triceps',    value: 'Triceps' },
  { label: 'Quadriceps', value: 'Quads' },
  { label: 'Hamstrings', value: 'Hamstrings' },
  { label: 'Billen',     value: 'Glutes' },
  { label: 'Kuiten',     value: 'Calves' },
  { label: 'Core/Buik',  value: 'Abs' },
]

const EMPTY_NEW = {
  name_nl: '', name_en: '', category: '',
  muscles_primary: [], muscles_secondary: [],
  equipment: '',
  available_home: true, available_gym: true,
  is_cardio: false, custom_description: '',
}

export default function ExerciseLibrary() {
  const { user } = useAuth()
  const isAdmin  = user?.is_admin

  // Filtercriteria
  const [q,            setQ]            = useState('')
  const [location,     setLocation]     = useState('')
  const [cardio,       setCardio]       = useState('')
  const [muscleFilter, setMuscleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState(new Set(['favoriet', 'actief']))

  // Bevroren snapshot — filtercriteria bepalen de fetch; statuswijzigingen muteren
  // alleen in-place en triggeren GEEN nieuwe fetch.
  const [snapshot,   setSnapshot]   = useState([])
  const [loading,    setLoading]    = useState(false)

  // Bulk-selectie
  const [selectMode, setSelectMode] = useState(false)
  const [selected,   setSelected]   = useState(new Set())
  const [bulkBusy,   setBulkBusy]   = useState(false)

  // Nieuw oefening modal
  const [showNew,  setShowNew]  = useState(false)
  const [newForm,  setNewForm]  = useState(EMPTY_NEW)
  const [newImage, setNewImage] = useState(null)
  const [newBusy,  setNewBusy]  = useState(false)
  const [newError, setNewError] = useState('')

  // Edit modal
  const [editEx,    setEditEx]    = useState(null)
  const [editForm,  setEditForm]  = useState({})
  const [editImage, setEditImage] = useState(null)
  const [editBusy,  setEditBusy]  = useState(false)

  // Gebruik ref om de laatste fetch te identificeren (voorkomt race-conditions)
  const fetchIdRef = useRef(0)

  const fetchSnapshot = useCallback(async () => {
    const fetchId = ++fetchIdRef.current
    setLoading(true)
    try {
      const params = {}
      if (q)             params.q        = q
      if (location)      params.location = location
      if (cardio !== '') params.cardio   = cardio === 'true'
      if (muscleFilter)  params.muscle   = muscleFilter
      if (statusFilter.has('inactief')) params.include_inactive = true
      const { data } = await api.get('/exercises/', { params })
      if (fetchId !== fetchIdRef.current) return  // verouderde response
      const items = Array.isArray(data) ? data : []
      // Pas statusfilter toe voor de initiële snapshot
      setSnapshot(items.filter(ex => statusFilter.has(ex.status || 'actief')))
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return
      console.error('Fout bij ophalen oefeningen:', err)
      setSnapshot([])
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, location, cardio, muscleFilter, statusFilter])

  useEffect(() => { fetchSnapshot() }, [fetchSnapshot])

  // --- Status per oefening ---
  async function setStatus(exId, newStatus) {
    try {
      await api.put(`/exercises/${exId}/status`, { status: newStatus })
      // Muteer alleen de snapshot — geen re-fetch, item blijft op z'n plek
      setSnapshot(prev => prev.map(x => x.id === exId ? { ...x, status: newStatus } : x))
    } catch (err) {
      console.error('Status wijzigen mislukt:', err)
    }
  }

  // Geeft aan of een item na een refresh zou verdwijnen (status past niet meer bij filter)
  function isOutOfFilter(ex) {
    return !statusFilter.has(ex.status || 'actief')
  }

  // --- Bulk-selectie ---
  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === snapshot.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(snapshot.map(ex => ex.id)))
    }
  }

  async function bulkSetStatus(newStatus) {
    setBulkBusy(true)
    const ids = [...selected]
    try {
      await Promise.all(ids.map(id => api.put(`/exercises/${id}/status`, { status: newStatus })))
      setSnapshot(prev => prev.map(x => selected.has(x.id) ? { ...x, status: newStatus } : x))
      setSelected(new Set())
    } catch (err) {
      console.error('Bulk status mislukt:', err)
    } finally {
      setBulkBusy(false)
    }
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }

  function toggleStatusFilter(s) {
    setStatusFilter(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  // --- Nieuw oefening ---
  function openNew() {
    setNewForm(EMPTY_NEW)
    setNewImage(null)
    setNewError('')
    setShowNew(true)
  }

  function toggleMuscle(list, value, setForm) {
    setForm(prev => {
      const cur = prev[list] || []
      return {
        ...prev,
        [list]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value],
      }
    })
  }

  async function saveNew() {
    if (!newForm.name_nl.trim()) { setNewError('Naam is verplicht'); return }
    setNewBusy(true)
    setNewError('')
    try {
      const payload = {
        ...newForm,
        name_en:   newForm.name_en   || null,
        category:  newForm.category  || null,
        equipment: newForm.equipment
          ? newForm.equipment.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        custom_description: newForm.custom_description || null,
      }
      const { data } = await api.post('/exercises/', payload)
      if (newImage) {
        const form = new FormData()
        form.append('file', newImage)
        await api.post(`/exercises/${data.id}/image`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      setShowNew(false)
      await fetchSnapshot()
    } catch (err) {
      setNewError(err.response?.data?.detail || 'Opslaan mislukt')
    } finally {
      setNewBusy(false)
    }
  }

  // --- Edit oefening ---
  function openEdit(ex) {
    setEditEx(ex)
    setEditForm({
      name_nl:            ex.name_nl            || '',
      name_en:            ex.name_en            || '',
      category:           ex.category           || '',
      muscles_primary:    ex.muscles_primary     || [],
      muscles_secondary:  ex.muscles_secondary   || [],
      equipment:          (ex.equipment || []).join(', '),
      available_home:     ex.available_home      ?? true,
      available_gym:      ex.available_gym       ?? true,
      is_cardio:          ex.is_cardio           ?? false,
      custom_description: ex.custom_description  || '',
      hidden:             ex.hidden              ?? false,
    })
    setEditImage(null)
  }

  async function saveEdit() {
    if (!editEx) return
    setEditBusy(true)
    try {
      if (editEx.is_custom) {
        await api.patch(`/exercises/${editEx.id}`, {
          name_nl:            editForm.name_nl            || null,
          name_en:            editForm.name_en            || null,
          category:           editForm.category           || null,
          muscles_primary:    editForm.muscles_primary,
          muscles_secondary:  editForm.muscles_secondary,
          equipment:          editForm.equipment
            ? editForm.equipment.split(',').map(s => s.trim()).filter(Boolean)
            : [],
          available_home:     editForm.available_home,
          available_gym:      editForm.available_gym,
          is_cardio:          editForm.is_cardio,
          custom_description: editForm.custom_description || null,
          hidden:             editForm.hidden,
        })
      } else {
        await api.patch(`/exercises/${editEx.id}`, {
          name_nl:            editForm.name_nl            || null,
          custom_description: editForm.custom_description || null,
          hidden:             editForm.hidden,
        })
      }
      if (editImage) {
        const form = new FormData()
        form.append('file', editImage)
        await api.post(`/exercises/${editEx.id}/image`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      setEditEx(null)
      await fetchSnapshot()
    } catch (err) {
      console.error('Opslaan mislukt:', err)
    } finally {
      setEditBusy(false)
    }
  }

  const canEdit = ex => isAdmin || (ex.is_custom && ex.created_by === user?.id)
  const allSelected = snapshot.length > 0 && selected.size === snapshot.length

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Oefeningen</h2>
        <button className="btn-secondary" onClick={openNew}>+ Nieuwe oefening</button>
      </div>

      {/* Filterbalk */}
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

        <select value={muscleFilter} onChange={e => setMuscleFilter(e.target.value)} className="select-input">
          <option value="">Alle spiergroepen</option>
          {MUSCLES.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Status-toggles + lijst-acties */}
      <div className="list-toolbar">
        <div className="status-filter-bar">
          {['favoriet', 'actief', 'inactief'].map(s => (
            <button
              key={s}
              className={`status-toggle-btn status-${s}${statusFilter.has(s) ? ' active' : ''}`}
              onClick={() => toggleStatusFilter(s)}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="list-actions">
          <button
            className="icon-btn-sm"
            onClick={fetchSnapshot}
            disabled={loading}
            title="Haal een verse lijst op op basis van de huidige filters"
          >
            ↺ Verversen
          </button>
          {!selectMode
            ? <button className="icon-btn-sm" onClick={() => setSelectMode(true)}>Selecteer</button>
            : <button className="icon-btn-sm" onClick={exitSelectMode}>Klaar</button>
          }
        </div>
      </div>

      {/* Bulk-actiebalk */}
      {selectMode && selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.size} geselecteerd</span>
          <span className="bulk-label">Zet op →</span>
          {['favoriet', 'actief', 'inactief'].map(s => (
            <button
              key={s}
              className={`bulk-status-btn bulk-status-btn--${s}`}
              onClick={() => bulkSetStatus(s)}
              disabled={bulkBusy}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {loading ? <p className="muted">Laden...</p> : (
        <>
          {selectMode && snapshot.length > 0 && (
            <label className="select-all-row">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
              />
              Alles selecteren ({snapshot.length})
            </label>
          )}

          <div className="ex-list">
            {snapshot.map(ex => {
              const outOfFilter = isOutOfFilter(ex)
              const isSelected  = selected.has(ex.id)
              return (
                <div
                  key={ex.id}
                  className={[
                    'ex-item',
                    outOfFilter     ? 'ex-item--pending-hide' : '',
                    isSelected      ? 'ex-item--selected'     : '',
                    selectMode      ? 'ex-item--selectable'   : '',
                  ].filter(Boolean).join(' ')}
                  onClick={selectMode ? () => toggleSelect(ex.id) : undefined}
                >
                  {selectMode && (
                    <input
                      type="checkbox"
                      className="ex-checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(ex.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  )}

                  <div className="ex-item-left">
                    <strong>{ex.name_nl || ex.name_en}</strong>
                    {ex.name_nl && ex.name_en && <span className="muted">{ex.name_en}</span>}
                    <div className="ex-tags">
                      {ex.category && (
                        <span className="ex-chip ex-chip--cat">{ex.category}</span>
                      )}
                      {ex.muscles_primary?.map(m => (
                        <span key={m} className="ex-chip">{m}</span>
                      ))}
                      {ex.available_home && <span className="ex-chip ex-chip--loc">🏠 Thuis</span>}
                      {ex.available_gym  && <span className="ex-chip ex-chip--loc">🏋️ Sport</span>}
                      {ex.is_cardio      && <span className="ex-chip ex-chip--loc">⚡ Cardio</span>}
                      {ex.is_custom      && <span className="ex-chip ex-chip--custom">eigen</span>}
                    </div>
                    {outOfFilter && (
                      <span className="pending-hide-label">verdwijnt bij verversen</span>
                    )}
                  </div>

                  {!selectMode && (
                    <div className="ex-item-right">
                      <div className="status-seg">
                        {['favoriet', 'actief', 'inactief'].map(s => (
                          <button
                            key={s}
                            className={`status-seg-btn status-seg-btn--${s}${(ex.status || 'actief') === s ? ' active' : ''}`}
                            onClick={e => { e.stopPropagation(); setStatus(ex.id, s) }}
                            disabled={(ex.status || 'actief') === s}
                            title={STATUS_LABEL[s]}
                          >
                            {s === 'favoriet' ? '★' : s === 'actief' ? '●' : '○'}
                          </button>
                        ))}
                      </div>
                      {canEdit(ex) && (
                        <button
                          className="ex-edit-btn"
                          onClick={e => { e.stopPropagation(); openEdit(ex) }}
                          title="Bewerken"
                        >
                          ✏
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {!snapshot.length && <p className="muted">Geen oefeningen gevonden.</p>}
          </div>
        </>
      )}

      {/* Nieuw oefening modal */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
            <h3>Nieuwe oefening toevoegen</h3>
            <div className="form">
              <label>
                Naam (NL) <span className="required">*</span>
                <input
                  value={newForm.name_nl}
                  onChange={e => setNewForm(f => ({ ...f, name_nl: e.target.value }))}
                  placeholder="bijv. Schuine dumbbell press"
                />
              </label>
              <label>
                Naam (EN)
                <input
                  value={newForm.name_en}
                  onChange={e => setNewForm(f => ({ ...f, name_en: e.target.value }))}
                  placeholder="bijv. Incline dumbbell press"
                />
              </label>
              <label>
                Categorie
                <input
                  value={newForm.category}
                  onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="bijv. Chest, Arms, Legs..."
                />
              </label>

              <div className="muscle-selects">
                <div>
                  <label className="label-block">Primaire spiergroepen</label>
                  <div className="muscle-chips">
                    {MUSCLES.map(m => (
                      <button
                        key={m.value}
                        type="button"
                        className={`muscle-chip${newForm.muscles_primary.includes(m.value) ? ' active' : ''}`}
                        onClick={() => toggleMuscle('muscles_primary', m.value, setNewForm)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label-block">Secundaire spiergroepen</label>
                  <div className="muscle-chips">
                    {MUSCLES.map(m => (
                      <button
                        key={m.value}
                        type="button"
                        className={`muscle-chip${newForm.muscles_secondary.includes(m.value) ? ' active' : ''}`}
                        onClick={() => toggleMuscle('muscles_secondary', m.value, setNewForm)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label>
                Materiaal (komma-gescheiden)
                <input
                  value={newForm.equipment}
                  onChange={e => setNewForm(f => ({ ...f, equipment: e.target.value }))}
                  placeholder="bijv. Barbell, Dumbbell"
                />
              </label>

              <div className="checkbox-row">
                <label className="checkbox-label">
                  <input type="checkbox" checked={newForm.available_home}
                    onChange={e => setNewForm(f => ({ ...f, available_home: e.target.checked }))} />
                  Beschikbaar thuis
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={newForm.available_gym}
                    onChange={e => setNewForm(f => ({ ...f, available_gym: e.target.checked }))} />
                  Beschikbaar sportschool
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={newForm.is_cardio}
                    onChange={e => setNewForm(f => ({ ...f, is_cardio: e.target.checked }))} />
                  Cardio
                </label>
              </div>

              <label>
                Beschrijving
                <textarea
                  className="edit-textarea"
                  value={newForm.custom_description}
                  onChange={e => setNewForm(f => ({ ...f, custom_description: e.target.value }))}
                  rows={3}
                  placeholder="Uitleg, techniek, aandachtspunten..."
                />
              </label>

              <label>
                Afbeelding (optioneel)
                <input type="file" accept="image/*"
                  onChange={e => setNewImage(e.target.files[0] || null)} />
              </label>

              {newError && <p className="error-text">{newError}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setShowNew(false)}>Annuleren</button>
              <button className="btn-secondary" onClick={saveNew} disabled={newBusy} style={{ flex: 1 }}>
                {newBusy ? 'Opslaan...' : 'Oefening aanmaken'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editEx && (
        <div className="modal-overlay" onClick={() => setEditEx(null)}>
          <div className={`modal${editEx.is_custom ? ' modal--wide' : ''}`} onClick={e => e.stopPropagation()}>
            <h3>Oefening bewerken</h3>
            <div className="form">
              <label>
                Naam (NL)
                <input
                  value={editForm.name_nl}
                  onChange={e => setEditForm(f => ({ ...f, name_nl: e.target.value }))}
                  placeholder={editEx.name_en}
                />
              </label>

              {editEx.is_custom && (
                <>
                  <label>
                    Naam (EN)
                    <input
                      value={editForm.name_en}
                      onChange={e => setEditForm(f => ({ ...f, name_en: e.target.value }))}
                    />
                  </label>
                  <label>
                    Categorie
                    <input
                      value={editForm.category}
                      onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                    />
                  </label>

                  <div className="muscle-selects">
                    <div>
                      <label className="label-block">Primaire spiergroepen</label>
                      <div className="muscle-chips">
                        {MUSCLES.map(m => (
                          <button
                            key={m.value}
                            type="button"
                            className={`muscle-chip${editForm.muscles_primary?.includes(m.value) ? ' active' : ''}`}
                            onClick={() => setEditForm(f => {
                              const cur = f.muscles_primary || []
                              return { ...f, muscles_primary: cur.includes(m.value) ? cur.filter(v => v !== m.value) : [...cur, m.value] }
                            })}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="label-block">Secundaire spiergroepen</label>
                      <div className="muscle-chips">
                        {MUSCLES.map(m => (
                          <button
                            key={m.value}
                            type="button"
                            className={`muscle-chip${editForm.muscles_secondary?.includes(m.value) ? ' active' : ''}`}
                            onClick={() => setEditForm(f => {
                              const cur = f.muscles_secondary || []
                              return { ...f, muscles_secondary: cur.includes(m.value) ? cur.filter(v => v !== m.value) : [...cur, m.value] }
                            })}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <label>
                    Materiaal (komma-gescheiden)
                    <input
                      value={editForm.equipment}
                      onChange={e => setEditForm(f => ({ ...f, equipment: e.target.value }))}
                    />
                  </label>

                  <div className="checkbox-row">
                    <label className="checkbox-label">
                      <input type="checkbox" checked={editForm.available_home}
                        onChange={e => setEditForm(f => ({ ...f, available_home: e.target.checked }))} />
                      Beschikbaar thuis
                    </label>
                    <label className="checkbox-label">
                      <input type="checkbox" checked={editForm.available_gym}
                        onChange={e => setEditForm(f => ({ ...f, available_gym: e.target.checked }))} />
                      Beschikbaar sportschool
                    </label>
                    <label className="checkbox-label">
                      <input type="checkbox" checked={editForm.is_cardio}
                        onChange={e => setEditForm(f => ({ ...f, is_cardio: e.target.checked }))} />
                      Cardio
                    </label>
                  </div>
                </>
              )}

              <label>
                Eigen beschrijving
                <textarea
                  className="edit-textarea"
                  value={editForm.custom_description}
                  onChange={e => setEditForm(f => ({ ...f, custom_description: e.target.value }))}
                  rows={4}
                  placeholder="Uitleg, aandachtspunten, technieknotities..."
                />
              </label>

              {isAdmin && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editForm.hidden}
                    onChange={e => setEditForm(f => ({ ...f, hidden: e.target.checked }))}
                  />
                  Verbergen voor alle gebruikers
                </label>
              )}

              <label>
                Afbeelding uploaden
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setEditImage(e.target.files[0] || null)}
                />
              </label>
              {imgUrl(editEx.image_url) && (
                <img
                  src={imgUrl(editEx.image_url)}
                  className="edit-preview"
                  alt="huidige afbeelding"
                />
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setEditEx(null)}>Annuleren</button>
              <button
                className="btn-secondary"
                onClick={saveEdit}
                disabled={editBusy}
                style={{ flex: 1 }}
              >
                {editBusy ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
