import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SwalDialog from '../components/SwalDialog'

function LoginPage() {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [swal, setSwal] = useState({ open: false, title: '', text: '', kind: 'error' })

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!form.email.trim() || !form.password.trim()) {
      setSwal({ open: true, title: 'Login Required', text: 'Please enter both your email and password.', kind: 'error' })
      return
    }

    ;(async () => {
      const result = await login(form.email, form.password)
      if (result.success) {
        navigate('/dashboard')
      } else {
        setSwal({ open: true, title: 'Login Failed', text: result.message, kind: 'error' })
      }
    })()
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div>
            <h2>KumarExports</h2>
            <p>Secure access to your export operations dashboard</p>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Username / Email</label>
          <input
            id="email"
            name="email"
            type="text"
            value={form.email}
            onChange={handleChange}
            placeholder="Enter your email or username"
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Enter your password"
          />

          <button type="submit">Login</button>
        </form>

      </div>

      <SwalDialog
        open={swal.open}
        title={swal.title}
        text={swal.text}
        kind={swal.kind}
        onClose={() => setSwal((current) => ({ ...current, open: false }))}
      />
    </div>
  )
}

export default LoginPage
