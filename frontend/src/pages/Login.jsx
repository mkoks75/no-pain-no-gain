import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth'
import api from '../api/client'

export default function Login() {
  const { login }    = useAuth()
  const navigate     = useNavigate()
  const [tab, setTab] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [err,  setErr]  = useState('')
  const [busy, setBusy] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleLogin(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      await login(form.email, form.password)
      navigate('/')
    } catch { setErr('Onjuiste inloggegevens') }
    finally { setBusy(false) }
  }

  async function handleRegister(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      await api.post('/auth/register', { name: form.name, email: form.email, password: form.password })
      await login(form.email, form.password)
      navigate('/')
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Registratie mislukt')
    }
    finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1 className="login-title">No Pain No Gain</h1>
        <p className="login-sub">Trainingsschema & workout tracker</p>

        <div className="tab-bar">
          <button className={`tab-btn ${tab==='login' ? 'active':''}`}    onClick={() => setTab('login')}>    Inloggen</button>
          <button className={`tab-btn ${tab==='register' ? 'active':''}`} onClick={() => setTab('register')}> Registreren</button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="form">
            <label>E-mail
              <input type="email" value={form.email} onChange={set('email')} required autoFocus />
            </label>
            <label>Wachtwoord
              <input type="password" value={form.password} onChange={set('password')} required />
            </label>
            {err && <p className="form-err">{err}</p>}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Bezig...' : 'Inloggen'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="form">
            <label>Naam
              <input type="text" value={form.name} onChange={set('name')} required autoFocus />
            </label>
            <label>E-mail
              <input type="email" value={form.email} onChange={set('email')} required />
            </label>
            <label>Wachtwoord
              <input type="password" value={form.password} onChange={set('password')} required minLength={6} />
            </label>
            {err && <p className="form-err">{err}</p>}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Bezig...' : 'Account aanmaken'}
            </button>
            <p className="form-hint">De eerste gebruiker wordt automatisch admin.</p>
          </form>
        )}
      </div>
    </div>
  )
}
