import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import SwalDialog from '../components/SwalDialog'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const fetchJson = async (url, options) => {
  const token = JSON.parse(localStorage.getItem('kumarexports-auth-user') || '{}')?.token
  const response = await fetch(url, { ...options, headers: { ...(options?.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()

  if (!contentType.includes('application/json')) {
    const snippet = text.trim().slice(0, 120)
    throw new Error(snippet ? `Backend returned a non-JSON response: ${snippet}` : 'Backend returned an invalid response.')
  }

  const data = text ? JSON.parse(text) : null
  return { response, data }
}

function ResetPasswordPage() {
  const { user } = useAuth()
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [swal, setSwal] = useState({ open: false, title: '', text: '', kind: 'success' })

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    if (error) {
      setError('')
    }
    if (success) {
      setSuccess('')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.currentPassword.trim() || !form.newPassword.trim() || !form.confirmNewPassword.trim()) {
      const message = 'Please fill all password fields.'
      setError(message)
      setSwal({ open: true, title: 'Validation Error', text: message, kind: 'error' })
      return
    }

    if (form.newPassword !== form.confirmNewPassword) {
      const message = 'New Password and Confirm New Password must match.'
      setError(message)
      setSwal({ open: true, title: 'Validation Error', text: message, kind: 'error' })
      return
    }

    if (form.currentPassword === form.newPassword) {
      const message = 'Old Password and New Password must be different.'
      setError(message)
      setSwal({ open: true, title: 'Validation Error', text: message, kind: 'error' })
      return
    }

    try {
      setLoading(true)
      setError('')
      setSuccess('')

      const { response, data } = await fetchJson(`${API_URL}/api/settings/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email,
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      })

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Unable to update password.')
      }

      setForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' })
      setSuccess('Password updated successfully.')
      setSwal({ open: true, title: 'Success', text: 'Password updated successfully.', kind: 'success' })
    } catch (err) {
      const message = err.message || 'Unable to update password.'
      setError(message)
      setSwal({ open: true, title: 'Update Failed', text: message, kind: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="welcome-card">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Reset Your Password</h2>
          <p>Enter your current password and choose a new one. The password updates only when the current password is correct and the new passwords match.</p>
        </div>
      </section>

      <section className="table-card">
        <form className="employee-form-grid reset-password-grid" onSubmit={handleSubmit}>
          <label>
            <span>Current Password</span>
            <input
              type="password"
              name="currentPassword"
              value={form.currentPassword}
              onChange={handleChange}
              placeholder="Current Password"
            />
          </label>
          <label>
            <span>New Password</span>
            <input
              type="password"
              name="newPassword"
              value={form.newPassword}
              onChange={handleChange}
              placeholder="New Password"
            />
          </label>
          <label>
            <span>Confirm New Password</span>
            <input
              type="password"
              name="confirmNewPassword"
              value={form.confirmNewPassword}
              onChange={handleChange}
              placeholder="Confirm New Password"
            />
          </label>

          <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? 'Updating...' : 'Submit'}
            </button>
          </div>
        </form>

        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="success-text">{success}</p> : null}
      </section>

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

export default ResetPasswordPage
