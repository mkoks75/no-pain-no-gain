import { useState, useEffect } from 'react'
import api from '../api/client'

export default function AdminUsers() {
  const [users,    setUsers]    = useState([])
  const [newUser,  setNewUser]  = useState({ name:'', email:'', password:'', is_admin:false })
  const [err,      setErr]      = useState('')
  const [busy,     setBusy]     = useState(false)

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    const { data } = await api.get('/users/')
    setUsers(data)
  }

  async function createUser(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      await api.post('/users/', newUser)
      setNewUser({ name:'', email:'', password:'', is_admin:false })
      await fetchUsers()
    } catch(ex) { setErr(ex.response?.data?.detail || 'Aanmaken mislukt') }
    finally { setBusy(false) }
  }

  async function deleteUser(id) {
    if (!confirm('Gebruiker verwijderen?')) return
    await api.delete(`/users/${id}`)
    await fetchUsers()
  }

  return (
    <div className="page">
      <h2 className="page-title">Gebruikersbeheer</h2>

      <section className="section">
        <h3 className="section-title">Nieuwe gebruiker</h3>
        <form onSubmit={createUser} className="form">
          <label>Naam     <input value={newUser.name}     onChange={e => setNewUser(u=>({...u,name:e.target.value}))}     required /></label>
          <label>E-mail   <input type="email" value={newUser.email}    onChange={e => setNewUser(u=>({...u,email:e.target.value}))}    required /></label>
          <label>Wachtwoord <input type="password" value={newUser.password} onChange={e => setNewUser(u=>({...u,password:e.target.value}))} required minLength={6}/></label>
          <label className="checkbox-label">
            <input type="checkbox" checked={newUser.is_admin} onChange={e => setNewUser(u=>({...u,is_admin:e.target.checked}))} />
            Admin
          </label>
          {err && <p className="form-err">{err}</p>}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Bezig...' : 'Gebruiker aanmaken'}
          </button>
        </form>
      </section>

      <section className="section">
        <h3 className="section-title">Gebruikers ({users.length})</h3>
        <div className="user-list">
          {users.map(u => (
            <div key={u.id} className="user-row">
              <div>
                <strong>{u.name}</strong>
                <span className="muted">{u.email}</span>
              </div>
              <div className="user-row-right">
                {u.is_admin && <span className="badge admin">admin</span>}
                <button className="icon-btn-sm danger" onClick={() => deleteUser(u.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
