import { useEffect, useState } from 'react'
import SwalDialog from '../components/SwalDialog'
import { useRolePermissions } from '../hooks/useRolePermissions'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const emptyForm = { name: '', email: '', password: '', canEdit: false }

const fetchJson = async (url, options) => {
  const token = JSON.parse(localStorage.getItem('kumarexports-auth-user') || '{}')?.token
  const response = await fetch(url, { ...options, headers: { ...(options?.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  const data = await response.json()
  return { response, data }
}

function UsersPage() {
  const { canManageUsers, isReadOnlyRole } = useRolePermissions()
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [swal, setSwal] = useState({ open: false, title: '', text: '', kind: 'error' })

  const loadUsers = async () => {
    setLoading(true)
    try {
      const { response, data } = await fetchJson(`${API_URL}/api/settings/users`)
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load users.')
      setUsers(data.users || [])
    } catch (error) {
      setSwal({ open: true, title: 'Users Error', text: error.message, kind: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canManageUsers) void loadUsers()
  // `loadUsers` is intentionally scoped to this page and reads no changing state.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageUsers])

  const deleteUser = async (id) => {
    if (!window.confirm('Delete this user?')) return
    const { response, data } = await fetchJson(`${API_URL}/api/settings/users/${id}`, { method: 'DELETE' })
    if (!response.ok || !data.ok) {
      setSwal({ open: true, title: 'Delete Failed', text: data.error || 'Unable to delete user.', kind: 'error' })
      return
    }
    await loadUsers()
  }

  const addUser = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const { response, data } = await fetchJson(`${API_URL}/api/settings/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to add user.')
      setForm(emptyForm)
      await loadUsers()
      setSwal({ open: true, title: 'User Added', text: 'The new user was added successfully.', kind: 'success' })
    } catch (error) {
      setSwal({ open: true, title: 'Add User Failed', text: error.message, kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`page-stack ${isReadOnlyRole ? 'role-readonly' : ''}`}>
      <section className="welcome-card"><h2>Users</h2></section>
      {!canManageUsers ? (
        <section className="table-card"><p className="form-error">Only IT department&apos;s Admin can handle users.</p></section>
      ) : (
        <>
        <section className="table-card">
          <form className="employee-form-grid users-form-grid" onSubmit={addUser}>
            <div><label htmlFor="new-user-name">Name</label><input id="new-user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={isReadOnlyRole} readOnly={isReadOnlyRole} /></div>
            <div><label htmlFor="new-user-email">Email</label><input id="new-user-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={isReadOnlyRole} readOnly={isReadOnlyRole} /></div>
            <div><label htmlFor="new-user-password">Password</label><input id="new-user-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required disabled={isReadOnlyRole} readOnly={isReadOnlyRole} /></div>
            <label className="permission-toggle"><input type="checkbox" checked={form.canEdit} onChange={(e) => setForm({ ...form, canEdit: e.target.checked })} disabled={isReadOnlyRole} /><span><strong>Read/write access</strong><small>Role 1 access</small></span></label>
            <div className="form-actions"><button className="primary-btn" type="submit" disabled={saving}>{saving ? 'Adding...' : 'Add User'}</button></div>
          </form>
        </section>
        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={5}>Loading users...</td></tr> : users.length ? users.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.email}</td>
                    <td><span className={`status-pill ${Number(row.roleid) === 1 ? '' : 'on-leave'}`}>{row.roleName || 'Unassigned role'}</span></td>
                    <td>{row.departmentName || 'Unassigned department'}</td>
                    <td>{isReadOnlyRole ? null : <button className="danger-btn" type="button" onClick={() => deleteUser(row.id)}>Delete</button>}</td>
                  </tr>
                )) : <tr><td colSpan={5}>No users found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        </>
      )}
      <SwalDialog open={swal.open} title={swal.title} text={swal.text} kind={swal.kind} onClose={() => setSwal((current) => ({ ...current, open: false }))} />
    </div>
  )
}

export default UsersPage
