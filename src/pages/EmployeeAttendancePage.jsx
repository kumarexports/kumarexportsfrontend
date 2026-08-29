import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import SwalDialog from '../components/SwalDialog'
import { useRolePermissions } from '../hooks/useRolePermissions'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const fetchJson = async (url, options) => {
  const token = JSON.parse(localStorage.getItem('kumarexports-auth-user') || '{}')?.token
  const response = await fetch(url, { ...options, headers: { ...(options?.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { ok: false, error: text }
    }
  }
  if (!response.ok || !data?.ok) throw new Error(data?.error || `Request failed (${response.status})`)
  return data
}

const normalizeHeader = (value) => String(value ?? '').trim().replace(/\s+/g, ' ')
const parseNum = (value) => {
  const normalized = String(value ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '').trim()
  return normalized === '' ? 0 : Number(normalized) || 0
}
const parseMonthYearFromFileName = (fileName) => {
  const match = String(fileName || '').match(/(\d{2})-(\d{4})/)
  if (!match) return null
  const month = Number(match[1])
  const year = Number(match[2])
  return month && year ? { month, year, label: `${String(month).padStart(2, '0')}-${year}` } : null
}

function EmployeeAttendancePage() {
  const { isReadOnlyRole, canEdit } = useRolePermissions()
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [swal, setSwal] = useState({ open: false, title: '', text: '', kind: 'success' })
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [savedRows, setSavedRows] = useState([])
  const fileInputRef = useRef(null)
  const pageSize = 15

  const loadMonthlyRows = async (month, year) => {
    if (!month || !year) return
    setLoading(true)
    try {
      const data = await fetchJson(`${API_URL}/api/salary-breakups?month=${month}&year=${year}`)
      setSavedRows(Array.isArray(data.rows) ? data.rows : [])
    } catch (err) {
      setSavedRows([])
      setError(err.message || 'Unable to load monthly salary breakups.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedMonth && selectedYear) {
      void loadMonthlyRows(selectedMonth, selectedYear)
    }
  }, [selectedMonth, selectedYear])

  const importAttendance = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setUploading(true)
      setError('')
      const parsedPeriod = parseMonthYearFromFileName(file.name)
      if (!parsedPeriod) throw new Error('Unable to resolve payroll month/year from the uploaded file name.')

      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: true })
      const sheet = workbook.SheetNames[0]
      if (!sheet) throw new Error('No worksheet found in the uploaded file.')

      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: '', raw: false })
      const cleanedRows = rawRows.filter((row) => Array.isArray(row) && row.some((cell) => cell !== '' && cell !== null && cell !== undefined))
      const headerRow = cleanedRows[0] || []
      const headers = headerRow.map(normalizeHeader)
      const required = ['EmpId', 'Employee Name', 'Present Days', 'OT Hours']
      const missing = required.filter((header) => !headers.includes(header))
      if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`)

      const importedRows = cleanedRows.slice(1).map((row) => {
        const record = {}
        headerRow.forEach((header, index) => {
          record[normalizeHeader(header)] = row[index]
        })
        return {
          empId: String(record.EmpId ?? record['Emp ID'] ?? '').trim(),
          employeeName: String(record['Employee Name'] ?? '').trim(),
          department: String(record.Department ?? '').trim(),
          presentDays: parseNum(record['Present Days']),
          overtimeHours: parseNum(record['OT Hours']),
        }
      }).filter((row) => row.empId)

      const data = await fetchJson(`${API_URL}/api/hr/attendance/import-monthly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: importedRows, sourceFileName: file.name }),
      })

      setSelectedMonth(parsedPeriod.month)
      setSelectedYear(parsedPeriod.year)
      await loadMonthlyRows(parsedPeriod.month, parsedPeriod.year)
      setSwal({ open: true, title: 'Attendance Imported', text: `Imported ${data.savedCount || importedRows.length} rows for ${parsedPeriod.label}. ${data.skippedCount || 0} rows were skipped.`, kind: 'success' })
    } catch (err) {
      setError(err.message || 'Unable to import attendance workbook.')
      setSwal({ open: true, title: 'Import Failed', text: err.message || 'Unable to import attendance workbook.', kind: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const departments = useMemo(() => Array.from(new Set(savedRows.map((row) => String(row.department || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [savedRows])
  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return savedRows.filter((row) => {
      const department = String(row.department || '').trim()
      const matchesDepartment = selectedDepartment === 'all' || department === selectedDepartment
      if (!matchesDepartment) return false
      if (!query) return true
      return [row.emp_id, row.employee_name, row.company, row.department, row.present_days, row.overtime_hours].some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [savedRows, searchTerm, selectedDepartment])

  const paginatedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedDepartment, searchTerm, selectedMonth, selectedYear])

  return (
    <div className={`page-stack ${isReadOnlyRole ? 'role-readonly' : ''}`}>
      <section className="welcome-card attendance-hero">
        <div>
          <p className="eyebrow">HR Attendance</p>
          <h2>Monthly Attendance Import</h2>
          <p>Upload files like <strong>Attendance 08-2026.xlsx</strong> with EmpId, Employee Name, Present Days, and OT Hours. Company is not read from the file; it is shown from the employee master record.</p>
        </div>
        {canEdit ? (
          <button type="button" className="secondary-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Importing...' : 'Import Attendance Excel'}
          </button>
        ) : null}
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={importAttendance} />
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      <SwalDialog open={swal.open} title={swal.title} text={swal.text} kind={swal.kind} onClose={() => setSwal((current) => ({ ...current, open: false }))} />

      <section className="toolbar-card">
        <div className="filters-row">
          <div className="attendance-note">
            <strong>Workflow:</strong> import the monthly file first. The imported rows are matched against the employee master and saved into monthly payroll records.
            <div className="attendance-note-subtext">
              {selectedMonth && selectedYear ? `Loaded period: ${String(selectedMonth).padStart(2, '0')}-${selectedYear}` : 'No attendance workbook imported yet.'}
            </div>
          </div>
        </div>
      </section>

      <section className="table-card">
        <div className="section-header attendance-table-header">
          <div>
            <p className="eyebrow">Salary Breakups Source</p>
            <h2>Imported Monthly Attendance</h2>
          </div>
        </div>
        <div className="filters-row" style={{ marginBottom: '1rem' }}>
          <div className="select-group">
            <label htmlFor="attendance-month">Month</label>
            <select id="attendance-month" value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))}>
              <option value="">Select month</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>
                  {String(month).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
          <div className="select-group">
            <label htmlFor="attendance-year">Year</label>
            <select id="attendance-year" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              <option value="">Select year</option>
              {Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - 1 + index).map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div className="select-group">
            <label htmlFor="attendance-department">Department</label>
            <select id="attendance-department" value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)}>
              <option value="all">All Departments</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </div>
          <div className="select-group" style={{ minWidth: '280px', flex: 1 }}>
            <label htmlFor="attendance-search">Search</label>
            <input id="attendance-search" type="search" value={searchTerm} placeholder="Search employee, department..." onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Emp ID</th>
                <th>Employee Name</th>
                <th>Company</th>
                <th>Department</th>
                <th>Present Days</th>
                <th>OT Hours</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length ? paginatedRows.map((row, index) => (
                <tr key={`${row.employee_id}-${index}`}>
                  <td>{(currentPage - 1) * pageSize + index + 1}</td>
                  <td>{row.empId || row.emp_id}</td>
                  <td>{row.employeeName || row.employee_name}</td>
                  <td>{row.company || ''}</td>
                  <td>{row.department}</td>
                  <td>{Number(row.present_days || 0).toFixed(2)}</td>
                  <td>{Number(row.overtime_hours || 0).toFixed(2)}</td>
                </tr>
              )) : (
                <tr><td className="empty-state-cell" colSpan={7}>{loading ? 'Loading...' : 'No attendance imported yet.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <button type="button" className="secondary-btn" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>Previous</button>
          <span className="pagination-label">Page {currentPage} of {totalPages}</span>
          <button type="button" className="secondary-btn" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>Next</button>
        </div>
      </section>
    </div>
  )
}

export default EmployeeAttendancePage
