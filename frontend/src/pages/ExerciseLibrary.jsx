import { useState, useEffect } from 'react'
import { useAuth } from '../store/auth'
import api from '../api/client'

function imgUrl(url) {
  if (!url) return null
  if (url.startsWith('/uploads')) return `/api${url}`
  return url
}

export default function ExerciseLibrary() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin

  const [exercises,  setExercises]  = useState([])
  const [favorites,  setFavorites]  = useState(new Set())
  const [q,          setQ]          = useState('')
  const [location,   setLocation]   = useState('')
  const [cardio,     setCardio]     = useState('')
  const [favOnly,    setFavOnly]    = useState(false)
  const [loading,    setLoading]    = useState(false)

  // Edit modal
  const [editEx,     setEditEx]     = useState(null)
  const [editNameNl, setEditNameNl] = useState('')
  const [editDesc,   setEditDesc]   = useState('')
  const [editHidden, setEditHidden] = useState(false)
  const [editImage,  setEditImage]  = useState(null)
  const [editBusy,   setEditBusy]   = useState(false)

  useEffect(() => { loadFavorites() }, [])
  useEffect(() => { search() }, [q, location, cardio])

  async function loadFavorites() {
    try {
      const { data } = await api.get('/favorites/')
      setFavorites(new Set(data))
    } catch { /* ignore */ }
  }

  async function toggleFavorite(e, exId) {
    e.stopPropagation()
    try {
      if (favorites.has(exId)) {
        await api.delete(`/favorites/${exId}`)
        setFavorites(prev => { const s = new Set(prev); s.delete(exId); return s })
      } else {
        await api.post(`/favorites/${exId}`)
        setFavorites(prev => new Set([...prev, exId]))
      }
    } catch (err) {
      console.error('Favoriet toggling mislukt:', err)
    }
  }

  async function search() {
    setLoading(true)
    try {
      const params = {}
      if (q)             params.q        = q
      if (location)      params.location = location
      if (cardio !== '') params.cardio   = cardio === 'true'
      const { data } = await api.get('/exercises/', { params })
      setExercises(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Fout bij ophalen oefeningen:', err)
      setExercises([])
    } finally {
      setLoading(false)
    }
  }

  function openEdit(ex) {
    setEditEx(ex)
    setEditNameNl(ex.name_nl || '')
    setEditDesc(ex.custom_description || '')
    setEditHidden(ex.hidden || false)
    setEditImage(null)
  }

  async function saveEdit() {
    if (!editEx) return
    setEditBusy(true)
    try {
      await api.patch(`/exercises/${editEx.id}`, {
        name_nl:            editNameNl || null,
        custom_description: editDesc   || null,
        hidden:             editHidden,
      })
      if (editImage) {
        const form = new FormData()
        form.append('file', editImage)
        await api.post(`/exercises/${editEx.id}/image`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      setEditEx(null)
      await search()
    } catch (err) {
      console.error('Opslaan mislukt:', err)
    } finally {
      setEditBusy(false)
    }
  }

  const displayed = favOnly
    ? exercises.filter(ex => favorites.has(ex.id))
    : exercises

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

        <button
          className={`fav-filter-btn${favOnly ? ' active' : ''}`}
          onClick={() => setFavOnly(v => !v)}
          title="Alleen favorieten tonen"
        >
          {favOnly ? '♥' : '♡'} Favorieten
        </button>
      </div>

      {loading ? <p className="muted">Laden...</p> : (
        <div className="ex-list">
          {displayed.map(ex => (
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
                <div className="ex-item-actions">
                  <button
                    className={`fav-btn${favorites.has(ex.id) ? ' active' : ''}`}
                    onClick={e => toggleFavorite(e, ex.id)}
                    title={favorites.has(ex.id) ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
                  >
                    {favorites.has(ex.id) ? '♥' : '♡'}
                  </button>
                  {isAdmin && (
                    <button className="edit-btn" onClick={() => openEdit(ex)} title="Bewerken">
                      ✏
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!displayed.length && <p className="muted">Geen oefeningen gevonden.</p>}
        </div>
      )}

      {/* Edit modal */}
      {editEx && (
        <div className="modal-overlay" onClick={() => setEditEx(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Oefening bewerken</h3>
            <div className="form">
              <label>
                Naam (NL)
                <input
                  value={editNameNl}
                  onChange={e => setEditNameNl(e.target.value)}
                  placeholder={editEx.name_en}
                />
              </label>
              <label>
                Eigen beschrijving
                <textarea
                  className="edit-textarea"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  rows={4}
                  placeholder="Uitleg, aandachtspunten, technieknotities..."
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editHidden}
                  onChange={e => setEditHidden(e.target.checked)}
                />
                Verbergen (niet zichtbaar in bibliotheek en planning)
              </label>
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
