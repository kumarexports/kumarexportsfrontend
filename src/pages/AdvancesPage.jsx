import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import SwalDialog from '../components/SwalDialog'
import { useRolePermissions } from '../hooks/useRolePermissions'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const months = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March']
const monthNumberMap = {
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12,
  January: 1,
  February: 2,
  March: 3,
}
const years = Array.from({ length: 11 }, (_, index) => new Date().getFullYear() + index)

const fetchJson = async (url, options) => {
  const token = JSON.parse(localStorage.getItem('kumarexports-auth-user') || '{}')?.token
  const response = await fetch(url, { ...options, headers: { ...(options?.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()
  if (!contentType.includes('application/json')) {
    throw new Error(text.trim().slice(0, 120) || 'Backend returned an invalid response.')
  }
  return { response, data: text ? JSON.parse(text) : null }
}

const extractNumber = (value) => {
  const normalized = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
    .trim()

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const readImportedNumber = (source, keys) => {
  if (!source || typeof source !== 'object') return null
  const values = new Map(Object.entries(source).map(([key, value]) => [String(key).replace(/[^a-z0-9]/gi, '').toLowerCase(), value]))
  for (const key of keys) {
    const value = values.get(String(key).replace(/[^a-z0-9]/gi, '').toLowerCase())
    if (value !== undefined && value !== null && String(value).trim() !== '') return extractNumber(value)
  }
  return null
}

const parseAdvancePeriodFromFileName = (fileName) => {
  const match = String(fileName || '').match(/^Advances\s+(\d{2})-(\d{4})(?:\s*\(\d+\))?\.xlsx$/i)
  if (!match) return null
  const month = Number(match[1])
  const year = Number(match[2])
  return month >= 1 && month <= 12 && year >= 2000 ? { month, year } : null
}

const normalizeHeader = (value) => String(value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase()

function AdvancesPage() {
  const { isReadOnlyRole, canEdit } = useRolePermissions()
  const [selectedMonth, setSelectedMonth] = useState('July')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState([])
  const [advanceRows, setAdvanceRows] = useState([])
  const [attendanceSummary, setAttendanceSummary] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [swal, setSwal] = useState({ open: false, title: '', text: '', kind: 'error' })
  const [finalizationState, setFinalizationState] = useState({ loading: false, finalized: null })
  const [selectedDepartment, setSelectedDepartment] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)
  const pageSize = 15

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const monthNumber = monthNumberMap[selectedMonth]
      const [{ response, data }, { response: attendanceResponse, data: attendanceData }, { response: advancesResponse, data: advancesData }] = await Promise.all([
        fetchJson(`${API_URL}/api/salary-breakups?month=${monthNumber}&year=${selectedYear}`),
        fetchJson(`${API_URL}/api/hr/attendance/summary?month=${monthNumber}&year=${selectedYear}&throughDate=${selectedYear}-${String(monthNumber).padStart(2, '0')}-${new Date(selectedYear, monthNumber, 0).getDate()}`),
        fetchJson(`${API_URL}/api/advances?month=${monthNumber}&year=${selectedYear}`),
      ])
      if (!response.ok || !data.ok || !attendanceResponse.ok || !attendanceData.ok || !advancesResponse.ok || !advancesData.ok) {
        throw new Error(data.error || 'Unable to load advances.')
      }
      setRows(data.rows || [])
      setAttendanceSummary(attendanceData.summary || [])
      setAdvanceRows(advancesData.rows || [])
    } catch (err) {
      const message = err.message || 'Unable to load advances.'
      setError(message)
      setSwal({ open: true, title: 'Advances Error', text: message, kind: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  // `load` is intentionally scoped to this page and uses the selected period.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear])

  useEffect(() => {
    const loadFinalization = async () => {
      try {
        setFinalizationState((current) => ({ ...current, loading: true }))
        const { response, data } = await fetchJson(
          `${API_URL}/api/salary-breakups/finalization-status?month=${monthNumberMap[selectedMonth]}&year=${selectedYear}`,
        )
        if (!response.ok || !data.ok) {
          throw new Error(data.error || 'Unable to load finalization status.')
        }
        setFinalizationState({ loading: false, finalized: data.finalized })
      } catch {
        setFinalizationState({ loading: false, finalized: null })
      }
    }

    void loadFinalization()
  }, [selectedMonth, selectedYear])

  const visibleRows = useMemo(() => {
    const salaryByEmployee = new Map(rows.map((entry) => [String(entry.employee_id), entry]))
    const attendanceByEmployee = new Map(attendanceSummary.map((entry) => [String(entry.employee_id), entry]))
    return advanceRows.map((row) => {
      const salaryRow = salaryByEmployee.get(String(row.employee_id))
      const attendance = attendanceByEmployee.get(String(row.employee_id))
      const presentDays = attendance ? Number(attendance.present_days || 0) : Number(salaryRow?.present_days || 0)
      const overtimeHours = attendance ? Number(attendance.overtime_hours || 0) : Number(salaryRow?.overtime_hours || 0)
      const importedData = salaryRow?.data && typeof salaryRow.data === 'object' ? salaryRow.data : {}
      const mRate = readImportedNumber(importedData, ['MRATE', 'M RATE', 'Monthly Rate']) ?? Number(salaryRow?.mrate || 0)
      const totalDays = new Date(selectedYear, monthNumberMap[selectedMonth], 0).getDate()
      const basicSalary = readImportedNumber(importedData, ['Basic Salary', 'BASIC', 'Basic']) ?? Number(salaryRow?.basic_salary || 0)
      const daysAmount = totalDays ? mRate * (presentDays / totalDays) : 0
      const overtimeAmount = totalDays ? mRate * (overtimeHours / (8 * totalDays)) : 0
      const pf = readImportedNumber(importedData, ['PF']) ?? 0
      const profTax = readImportedNumber(importedData, ['PROF. TAX', 'PROF TAX', 'Professional Tax']) ?? 0
      const pfVol = readImportedNumber(importedData, ['PF VOL', 'PFVOL', 'PF_VOL']) ?? 0
      const tds = readImportedNumber(importedData, ['TDS']) ?? 0
      const esi = basicSalary < 21000 ? daysAmount * 0.0075 : 0
      const grossSalary = daysAmount + overtimeAmount
      const advanceValue = Number((row.advance ?? salaryRow?.advance_amount ?? salaryRow?.advance) || 0)
      const finalSalary = grossSalary - (5 + pf + profTax + advanceValue + pfVol + esi + tds)
      return {
        ...salaryRow,
        ...row,
        mrate: mRate,
        total_days: totalDays,
        present_days: presentDays,
        overtime_hours: overtimeHours,
        advance_amount: advanceValue,
        calculatedSalary: Number(finalSalary.toFixed(2)),
      }
    })
  }, [advanceRows, attendanceSummary, rows, selectedMonth, selectedYear])

  const departmentOptions = useMemo(() => {
    const departments = Array.from(
      new Set(
        visibleRows
          .map((row) => String(row.department || '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b))

    return ['all', ...departments]
  }, [visibleRows])

  const filteredRows = useMemo(() => {
    const departmentFilter = selectedDepartment.toLowerCase()
    const query = searchTerm.trim().toLowerCase()

    return visibleRows.filter((row) => {
      const matchesDepartment =
        departmentFilter === 'all' || String(row.department || '').toLowerCase() === departmentFilter
      if (!matchesDepartment) {
        return false
      }

      if (!query) {
        return true
      }

      const searchableValues = [
        row.sno,
        row.empId,
        row.employeeName,
        row.fatherName,
        row.department,
        row.calculatedSalary,
        row.advance_amount ?? row.advance,
      ]

      return searchableValues.some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [searchTerm, selectedDepartment, visibleRows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const paginatedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredRows],
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedMonth, selectedYear, selectedDepartment, searchTerm, rows.length])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const importAdvances = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (finalizationState.finalized) {
      setSwal({
        open: true,
        title: 'Month Finalized',
        text: 'Import Advances Excel is not available for finalized months.',
        kind: 'error',
      })
      return
    }

    const period = parseAdvancePeriodFromFileName(file.name)
    if (!period) {
      setSwal({ open: true, title: 'Invalid file name', text: 'Use the exact format Advances MM-YYYY.xlsx.', kind: 'error' })
      return
    }

    try {
      setImporting(true)
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const records = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      const rows = records.map((record) => {
        const values = Object.fromEntries(Object.entries(record).map(([key, value]) => [normalizeHeader(key), value]))
        return {
          empId: String(values.empid ?? '').trim(),
          name: String(values.name ?? '').trim(),
          advance: extractNumber(values.advance),
        }
      }).filter((row) => row.empId && row.name && row.advance >= 0)

      if (!rows.length) throw new Error('No valid rows found. Required headers are EmpID, Name and Advance.')

      const { response: employeesResponse, data: employeesData } = await fetchJson(`${API_URL}/api/hr/employees`)
      if (!employeesResponse.ok || !employeesData.ok) {
        throw new Error(employeesData.error || 'Unable to validate employee IDs against Masters - Employees.')
      }

      const masterEmployeeIds = new Set(
        (employeesData.employees || []).map((employee) => String(employee.empId || employee.emp_id || employee.id || '').trim()).filter(Boolean),
      )
      const unmatchedEmpIds = rows
        .map((row) => row.empId)
        .filter((empId) => !masterEmployeeIds.has(String(empId).trim()))

      if (unmatchedEmpIds.length > 0) {
        const uniqueUnmatched = Array.from(new Set(unmatchedEmpIds))
        throw new Error(`These EmpIDs were not found in Masters - Employees: ${uniqueUnmatched.join(', ')}`)
      }

      const { response, data } = await fetchJson(`${API_URL}/api/advances/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: period.month, year: period.year, rows }),
      })
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to import advances.')

      const selectedMonthName = Object.keys(monthNumberMap).find((month) => monthNumberMap[month] === period.month)
      if (selectedMonthName) setSelectedMonth(selectedMonthName)
      setSelectedYear(period.year)
      setSwal({ open: true, title: 'Advances imported', text: `Updated ${data.updatedCount} records for ${String(period.month).padStart(2, '0')}-${period.year}.`, kind: 'success' })
      await load()
    } catch (err) {
      setSwal({ open: true, title: 'Import failed', text: err.message || 'Unable to import advances.', kind: 'error' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className={`page-stack ${isReadOnlyRole ? 'role-readonly' : ''}`}>
      <section className="welcome-card">
        <div>
          <p className="eyebrow">HR Advances</p>
          <h2>Month-wise Advance Records</h2>
          <p>All employee advances paid in the selected month are shown here. Advance can never exceed payable salary.</p>
        </div>
        {finalizationState.finalized ? <span className="status-badge finalized">Finalized</span> : null}
      </section>

      <section className="toolbar-card">
        <div className="filters-row" style={{ marginBottom: '1rem' }}>
          <div className="select-group">
            <label htmlFor="adv-month">Month</label>
            <select id="adv-month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
              {months.map((month) => <option key={month} value={month}>{month}</option>)}
            </select>
          </div>
          <div className="select-group">
            <label htmlFor="adv-year">Year</label>
            <select id="adv-year" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <div className="select-group">
            <label>&nbsp;</label>
            {canEdit ? (
              <>
                <button type="button" className="secondary-btn" onClick={() => fileInputRef.current?.click()} disabled={importing || Boolean(finalizationState.finalized)}>
                  {importing ? 'Importing...' : finalizationState.finalized ? 'Month Finalized' : 'Import Advances Excel'}
                </button>
                <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={importAdvances} />
              </>
            ) : null}
          </div>
        </div>

        <div className="filters-row" style={{ marginTop: '1rem', flexWrap: 'wrap' }}>
          <div className="select-group" style={{ minWidth: '240px' }}>
            <label htmlFor="adv-department-filter">Department</label>
            <select
              id="adv-department-filter"
              value={selectedDepartment}
              disabled={!canEdit}
              onChange={(event) => setSelectedDepartment(event.target.value)}
            >
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department === 'all' ? 'All Departments' : department}
                </option>
              ))}
            </select>
          </div>

          <div className="select-group" style={{ minWidth: '280px', flex: '1' }}>
            <label htmlFor="adv-search">Search</label>
            <input
              id="adv-search"
              type="search"
              placeholder="Search by any cell..."
              value={searchTerm}
              readOnly={!canEdit}
              disabled={!canEdit}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>
      </section>

      {loading ? <p className="form-error">Loading advances...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="table-card">
        <div className="section-header attendance-table-header" style={{ marginBottom: '16px' }}>
          <div>
            <p className="eyebrow">Advance Entry</p>
            <h2>Edit Monthly Advances</h2>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>S No.</th>
                <th>EmpId</th>
                <th>Name</th>
                <th>Father&apos;s Name</th>
                <th>Current Advance</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length > 0 ? paginatedRows.map((row, index) => (
                <tr key={row.employee_id}>
                  <td>{row.sno || index + 1}</td>
                  <td>{row.empId}</td>
                  <td>{row.employeeName}</td>
                  <td>{row.fatherName}</td>
                  <td>{Number((row.advance_amount ?? row.advance) || 0).toFixed(2)}</td>
                </tr>
              )) : (
                <tr>
                  <td className="empty-state-cell" colSpan={5}>No advance records available for the selected month.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar">
          <button type="button" className="secondary-btn" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
            Previous
          </button>
          <span className="pagination-label">
            Page {currentPage} of {totalPages}
          </span>
          <button type="button" className="secondary-btn" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>
            Next
          </button>
        </div>
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

export default AdvancesPage
