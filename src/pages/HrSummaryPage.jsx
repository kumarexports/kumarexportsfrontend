import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx-js-style'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const fetchJson = async (url) => {
  const token = JSON.parse(localStorage.getItem('kumarexports-auth-user') || '{}')?.token
  const response = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok || !data?.ok) throw new Error(data?.error || 'Unable to load HR Summary records.')
  return data
}

const money = (value) => Number(value || 0).toFixed(2)

function HrSummaryPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const data = await fetchJson(`${API_URL}/api/hr/reports/hr-summary`)
        setRows(data.rows || [])
      } catch (err) {
        setRows([])
        setError(err.message || 'Unable to load HR Summary records.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const exportEmployeeDates = (row) => {
    const leaveDates = Array.isArray(row.leave_dates) ? row.leave_dates : []
    const exportRows = leaveDates.map((entry) => ({
      'Employee ID': row.empId,
      'Employee Name': row.employeeName,
      Department: row.department,
      Date: entry.date,
      Status: entry.status,
      'Leave Category': entry.status === 'absent' && !String(entry.leaveCategory || '').trim() ? 'Week Off' : (entry.leaveCategory || ''),
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const headerRow = 1
    const headerStyle = {
      fill: { fgColor: { rgb: 'C6EFCE' } },
      font: { bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: '808080' } },
        bottom: { style: 'thin', color: { rgb: '808080' } },
        left: { style: 'thin', color: { rgb: '808080' } },
        right: { style: 'thin', color: { rgb: '808080' } },
      },
    }
    const bodyBorder = {
      top: { style: 'thin', color: { rgb: 'D9D9D9' } },
      bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
      left: { style: 'thin', color: { rgb: 'D9D9D9' } },
      right: { style: 'thin', color: { rgb: 'D9D9D9' } },
    }
    ;['A1', 'B1', 'C1', 'D1', 'E1', 'F1'].forEach((cellRef) => {
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = headerStyle
      }
    })
    leaveDates.forEach((_, index) => {
      const rowNumber = index + 2
      ;['A', 'B', 'C', 'D', 'E', 'F'].forEach((column) => {
        const cellRef = `${column}${rowNumber}`
        if (worksheet[cellRef]) {
          worksheet[cellRef].s = { border: bodyBorder }
        }
      })
    })
    worksheet['!cols'] = [
      { wch: Math.max(10, 'Employee ID'.length + 2) },
      { wch: Math.max(18, 'Employee Name'.length + 4) },
      { wch: Math.max(18, 'Department'.length + 4) },
      { wch: Math.max(14, 'Date'.length + 4) },
      { wch: Math.max(12, 'Status'.length + 4) },
      { wch: Math.max(18, 'Leave Category'.length + 6) },
    ]
    worksheet['!autofilter'] = { ref: `A${headerRow}:F${Math.max(leaveDates.length + headerRow, headerRow)}` }
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leave Dates')
    XLSX.writeFile(workbook, `HR Summary ${row.empId}.xlsx`)
  }

  const getWeekOffLeave = useCallback((row) => Number((
    Number(row.weekOffLeave ?? 0) ||
    Math.max(
      0,
      Number(row.total_absent_days || 0) -
      Number(row.withoutPriorInformation || 0) -
      Number(row.leaveToBeEncashed || 0) -
      Number(row.leaveByEsi || 0),
    )
  ).toFixed(2)), [])

  const departmentOptions = useMemo(() => {
    const departments = Array.from(
      new Set(rows.map((row) => String(row.department || '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b))
    return ['all', ...departments]
  }, [rows])

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const departmentFilter = selectedDepartment.toLowerCase()

    return rows.filter((row) => {
      const matchesDepartment =
        departmentFilter === 'all' || String(row.department || '').toLowerCase() === departmentFilter
      if (!matchesDepartment) return false
      if (!query) return true

      const searchValues = [
        row.sno,
        row.empId,
        row.employeeName,
        row.fatherName,
        row.department,
        row.total_absent_days,
        row.withoutPriorInformation,
        row.leaveToBeEncashed,
        row.leaveByEsi,
        getWeekOffLeave(row),
      ]

      return searchValues.some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [getWeekOffLeave, rows, searchTerm, selectedDepartment])

  const totalRows = useMemo(() => filteredRows.length, [filteredRows.length])
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const paginatedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredRows],
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedDepartment])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  return (
    <div className="page-stack">
      <section className="welcome-card salary-card">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>HR Summary</h2>
          <p>All employees with total absent days and leave category totals from attendance history.</p>
        </div>
      </section>

      {loading ? <p className="form-error">Loading HR Summary...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="table-card">
        <div className="section-header attendance-table-header">
          <div>
            <p className="eyebrow">Stored Records</p>
            <h2>{totalRows} Employees</h2>
          </div>
        </div>
        <div className="filters-row" style={{ marginBottom: '16px', alignItems: 'flex-end' }}>
          <div className="select-group">
            <label htmlFor="hr-summary-department">Department</label>
            <select
              id="hr-summary-department"
              value={selectedDepartment}
              onChange={(event) => setSelectedDepartment(event.target.value)}
            >
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department === 'all' ? 'All Departments' : department}
                </option>
              ))}
            </select>
          </div>
          <div className="select-group" style={{ minWidth: '260px' }}>
            <label htmlFor="hr-summary-search">Search</label>
            <input
              id="hr-summary-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by employee, emp ID, or leave type"
            />
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="sticky-col sticky-col-1">S.No</th>
                <th className="sticky-col sticky-col-2">Employee ID</th>
                <th className="sticky-col sticky-col-3">Employee Name</th>
                <th>Father&apos;s Name</th>
                <th>Department</th>
                <th>Total Absent Days</th>
                <th>Without Prior Information</th>
                <th>Leave to be Encashed</th>
                <th>Leave by ESI</th>
                <th>Week off Leave</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, index) => (
                <tr key={row.employee_id}>
                  <td className="sticky-col sticky-col-1">{row.sno || (currentPage - 1) * pageSize + index + 1}</td>
                  <td className="sticky-col sticky-col-2">{row.empId}</td>
                  <td className="sticky-col sticky-col-3">{row.employeeName}</td>
                  <td>{row.fatherName}</td>
                  <td>{row.department}</td>
                  <td>{money(row.total_absent_days)}</td>
                  <td>{money(row.withoutPriorInformation)}</td>
                  <td>{money(row.leaveToBeEncashed)}</td>
                  <td>{money(row.leaveByEsi)}</td>
                  <td>{money(getWeekOffLeave(row))}</td>
                  <td>
                    <button type="button" className="secondary-btn" onClick={() => exportEmployeeDates(row)}>
                      Download
                    </button>
                  </td>
                </tr>
              ))}
              {!paginatedRows.length && !loading ? (
                <tr>
                  <td colSpan="11" className="empty-state-cell">
                    No HR Summary records are available.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span className="pagination-label">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  )
}

export default HrSummaryPage
