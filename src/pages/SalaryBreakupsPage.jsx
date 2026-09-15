import { useEffect, useMemo, useState } from 'react'
import SwalDialog from '../components/SwalDialog'
import * as XLSX from 'xlsx'
import { useRolePermissions } from '../hooks/useRolePermissions'
import { applyExcelTableStyle } from '../utils/excelFormatting'

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
    const snippet = text.trim().slice(0, 120)
    throw new Error(snippet ? `Backend returned a non-JSON response: ${snippet}` : 'Backend returned an invalid response.')
  }

  const data = text ? JSON.parse(text) : null
  return { response, data }
}

const daysInMonth = (monthName, year) => {
  const monthIndex = monthNumberMap[monthName] || 1
  return new Date(year, monthIndex, 0).getDate()
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
  const normalized = new Map(
    Object.entries(source).map(([key, value]) => [String(key).replace(/[^a-z0-9]/gi, '').toLowerCase(), value]),
  )
  for (const key of keys) {
    const value = normalized.get(String(key).replace(/[^a-z0-9]/gi, '').toLowerCase())
    if (value !== undefined && value !== null && String(value).trim() !== '') return extractNumber(value)
  }
  return null
}

const readImportedPositiveNumber = (source, keys) => {
  const value = readImportedNumber(source, keys)
  return value && value > 0 ? value : null
}

const pickFirstPositive = (...values) => {
  for (const value of values) {
    const numeric = extractNumber(value)
    if (numeric > 0) return numeric
  }
  return 0
}

const calculateDaysAmount = (mRate, presentDays, totalDays) => {
  const rate = extractNumber(mRate)
  const present = extractNumber(presentDays)
  const total = extractNumber(totalDays)

  if (!rate || !total) {
    return 0
  }

  return Number((rate * (present / total)).toFixed(2))
}

const calculateOtAmount = (mRate, overtimeHours, totalDays) => {
  const rate = extractNumber(mRate)
  const overtime = extractNumber(overtimeHours)
  const total = extractNumber(totalDays)

  if (!rate || !total) {
    return 0
  }

  return Number((rate * (overtime / (8 * total))).toFixed(2))
}

const normalizeYesNo = (value) => {
  const text = String(value ?? '').trim().toLowerCase()
  return text === 'yes' || text === 'y' || text === 'true' || text === '1'
}

const resolveMasterDeduction = (rawValue, basicSalary) => {
  const text = String(rawValue ?? '').trim()
  const numeric = extractNumber(text)
  if (!text || !Number.isFinite(numeric)) {
    return 0
  }
  if (numeric < 100) {
    return Number((basicSalary * (numeric / 100)).toFixed(2))
  }
  return Number(numeric.toFixed(2))
}

const resolvePfDeduction = (rawValue, basicSalary) => {
  if (normalizeYesNo(rawValue)) {
    return Number(Math.min(1800, basicSalary * 0.12).toFixed(2))
  }
  return 0
}

const getTargetMonthYear = (monthName, year) => {
  const monthNumber = monthNumberMap[monthName]
  return { targetMonthNumber: monthNumber, targetYear: year, targetMonthName: monthName }
}

function SalaryBreakupsPage() {
  const { isReadOnlyRole, canEdit } = useRolePermissions()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('July')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [employeeRows, setEmployeeRows] = useState([])
  const [attendanceSummary, setAttendanceSummary] = useState([])
  const [savedRows, setSavedRows] = useState([])
  const [selectedDepartment, setSelectedDepartment] = useState('all')
  const [selectedCompany, setSelectedCompany] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [swalState, setSwalState] = useState({ open: false, title: '', text: '', kind: 'success' })
  const [currentPage, setCurrentPage] = useState(1)
  const [finalizeDialog, setFinalizeDialog] = useState({
    open: false,
    loading: false,
    month: null,
    year: null,
    missingDates: [],
    finalized: false,
    hasAttendanceData: true,
  })
  const pageSize = 15
  const today = new Date()
  const { targetMonthNumber, targetYear: targetMonthYear, targetMonthName } = getTargetMonthYear(selectedMonth, selectedYear)
  const [finalizationState, setFinalizationState] = useState({ loading: false, finalized: null })
  const isMarch2026 = targetMonthNumber === 3 && targetMonthYear === 2026
  const canShowFinalizeButton = today.getDate() >= 2 && !isMarch2026

  const totalDays = useMemo(() => daysInMonth(selectedMonth, selectedYear), [selectedMonth, selectedYear])

  const loadEmployeeData = async () => {
    const selectedMonthNumber = monthNumberMap[selectedMonth]
    const selectedMonthLastDate = `${selectedYear}-${String(selectedMonthNumber).padStart(2, '0')}-${String(daysInMonth(selectedMonth, selectedYear)).padStart(2, '0')}`
    const [
      { response: empResponse, data: empData },
      { response: attResponse, data: attData },
      { response: savedResponse, data: savedData },
    ] = await Promise.all([
      fetchJson(`${API_URL}/api/hr/employees`),
      fetchJson(`${API_URL}/api/hr/attendance/summary?month=${selectedMonthNumber}&year=${selectedYear}&throughDate=${selectedMonthLastDate}`),
      fetchJson(`${API_URL}/api/salary-breakups?month=${selectedMonthNumber}&year=${selectedYear}`),
    ])

    if (!empResponse.ok || !empData.ok) {
      throw new Error(empData.error || 'Unable to load employees')
    }

    if (!attResponse.ok || !attData.ok) {
      throw new Error(attData.error || 'Unable to load attendance summary')
    }

    if (!savedResponse.ok || !savedData.ok) {
      throw new Error(savedData.error || 'Unable to load saved salary breakups')
    }

    setEmployeeRows(empData.employees || [])
    setAttendanceSummary(attData.summary || [])
    setSavedRows(savedData.rows || [])
  }

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        setError('')
        await loadEmployeeData()
      } catch (err) {
        setError(err.message || 'Unable to load salary data.')
      } finally {
        setLoading(false)
      }
    }

    void init()
  // The loader is page-local and this effect is keyed by the selected period.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear])

  useEffect(() => {
    const loadFinalization = async () => {
      try {
        setFinalizationState((current) => ({ ...current, loading: true }))
        const { response, data } = await fetchJson(
          `${API_URL}/api/salary-breakups/finalization-status?month=${targetMonthNumber}&year=${targetMonthYear}`,
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
  }, [selectedMonth, selectedYear, targetMonthNumber, targetMonthYear])

  const enrichedRows = useMemo(() => {
    const attendanceByEmployeeId = new Map(
      attendanceSummary.map((entry) => [String(entry.employee_id), entry]),
    )

    const savedByEmployeeId = new Map(savedRows.map((entry) => [String(entry.employee_id), entry]))
    const seenEmployeeIds = new Set()

    return employeeRows
      .filter((employee) => {
        const employeeKey = `${String(employee.company || '').trim().toLowerCase()}::${String(employee.empId || employee.id)}`
        if (seenEmployeeIds.has(employeeKey)) {
          return false
        }
        seenEmployeeIds.add(employeeKey)
        return true
      })
      .map((employee) => {
      const presentDays = Number(attendanceByEmployeeId.get(String(employee.id))?.present_days || 0)
      const overtimeHours = Number(attendanceByEmployeeId.get(String(employee.id))?.overtime_hours || 0)
      const savedRow = savedByEmployeeId.get(String(employee.id))
      const importedData = savedRow?.data && typeof savedRow.data === 'object' ? savedRow.data : employee.importData || {}
      const mRate = pickFirstPositive(employee.masterMRate, employee.mrate, employee.mRate, savedRow?.mrate)
      const basicSalary = pickFirstPositive(employee.basicPackage, employee.basicSalary, employee.basic_package, savedRow?.basic_salary, savedRow?.basicPackage)
      const totalDaysCount = totalDays || 1
      const finalSalary = Number((basicSalary * (presentDays / totalDaysCount)).toFixed(2))
      const derivedBasicSalary = Number((finalSalary * 0.65).toFixed(2))
      const remainingBalance = Number((finalSalary - derivedBasicSalary).toFixed(2))
      const hra = Number((remainingBalance * 0.66).toFixed(2))
      const ta = Number((remainingBalance * 0.22).toFixed(2))
      const washingAllowance = Number((remainingBalance * 0.12).toFixed(2))
      const differenceAmount = Math.max(0, Number((basicSalary - finalSalary).toFixed(2)))
      const otAllowance = Number(Math.min(differenceAmount, 350).toFixed(2))
      const incentive = Number(Math.max(0, differenceAmount - otAllowance).toFixed(2))
      const daysAmount = calculateDaysAmount(mRate, presentDays, totalDays)
      const otAmount = calculateOtAmount(mRate, overtimeHours, totalDays)
      const total = Number((daysAmount + otAmount).toFixed(2))
      const plwf = 5
      const pfValue = employee.pfValue ?? employee.pf_value ?? employee.importData?.deductions?.pf?.raw ?? null
      const pfVolValue = employee.pfvolValue ?? employee.pfvol_value ?? importedData.PFVOL ?? importedData.pfVol
      const profTaxValue = employee.profTaxValue ?? employee.prof_tax_value ?? importedData['PROF.TAX'] ?? importedData.profTax
      const pfFromMaster = resolvePfDeduction(pfValue, derivedBasicSalary)
      const pfFromImport = readImportedPositiveNumber(importedData, ['PF']) || 0
      const pf = pfFromMaster || pfFromImport
      const pfVol = resolveMasterDeduction(pfVolValue ?? readImportedNumber(importedData, ['PF VOL', 'PFVOL', 'PF_VOL']), basicSalary)
      const esi = (basicSalary * 0.65) <= 21000
        ? Number((derivedBasicSalary * 0.0075).toFixed(2))
        : 0
      const profTax = resolveMasterDeduction(profTaxValue ?? readImportedNumber(importedData, ['PROF. TAX', 'PROF TAX', 'Professional Tax']), basicSalary)
      const advance = extractNumber(savedRow?.advance_amount || employee.advanceAmount)
      const tds = resolveMasterDeduction(employee.tdsValue ?? employee.tds_value ?? readImportedNumber(importedData, ['TDS']), basicSalary)
      const totalDeductions = Number((plwf + profTax + advance + pf + pfVol + esi + tds).toFixed(2))
      const finalAmount = Math.round(total - totalDeductions)

      return {
        ...employee,
        presentDays,
        overtimeHours,
        totalDays,
        mRate,
        basicSalary,
        month: targetMonthNumber,
        year: targetMonthYear,
        finalSalary,
        derivedBasicSalary,
        remainingBalance,
        hra,
        ta,
        washingAllowance,
        otAllowance,
        incentive,
        daysAmount,
        otAmount,
        total,
        plwf,
        pf,
        profTax,
        advance,
        pfVol,
        esi,
        tds,
        totalDeductions,
        finalAmount,
      }
      })
  }, [attendanceSummary, employeeRows, savedRows, totalDays, targetMonthNumber, targetMonthYear])

  const visibleRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const departmentFilter = selectedDepartment.toLowerCase()

    return enrichedRows.filter((row) => {
      const matchesCompany = selectedCompany === 'all' || String(row.company || '').toLowerCase() === selectedCompany.toLowerCase()
      const matchesDepartment =
        departmentFilter === 'all' || String(row.department || '').toLowerCase() === departmentFilter

      if (!matchesCompany || !matchesDepartment) {
        return false
      }

      if (!query) {
        return true
      }

      const searchValues = [
        row.sno,
        row.empId,
        row.employeeName,
        row.fatherName,
        row.department,
        row.mRate,
        row.basicSalary,
        row.presentDays,
        row.overtimeHours,
        row.totalDays,
        row.daysAmount,
        row.otAmount,
        row.total,
        row.totalDeductions,
        row.finalAmount,
      ]

      return searchValues.some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [enrichedRows, searchTerm, selectedCompany, selectedDepartment])

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize))
  const paginatedRows = useMemo(
    () => visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, visibleRows],
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedMonth, selectedYear, selectedCompany, selectedDepartment, searchTerm, employeeRows.length])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const departmentOptions = useMemo(() => {
    const departments = Array.from(
      new Set(
        employeeRows
          .map((employee) => String(employee.department || '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b))

    return ['all', ...departments]
  }, [employeeRows])

  const companyOptions = useMemo(
    () => ['all', ...Array.from(new Set(employeeRows.map((employee) => String(employee.company || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [employeeRows],
  )


  const downloadSalaryBreakups = () => {
    if (!enrichedRows.length) {
      showSwal('Nothing to download', `No Salary Breakups records are available for ${selectedMonth} ${selectedYear}.`, 'error')
      return
    }
    const rounded = (value) => Math.round(Number(value || 0))
    const exportRows = enrichedRows.map((row, index) => ({
      'S.No': index + 1,
      'Emp ID': row.empId,
      'Employee Name': row.employeeName,
      "Father's Name": row.fatherName,
      Company: row.company,
      Department: row.department,
      MRate: rounded(row.mRate),
      'Basic Salary': rounded(row.basicSalary),
      Month: selectedMonth,
      Year: selectedYear,
      'Present Days': rounded(row.presentDays),
      'Total Days': rounded(row.totalDays),
      'OT Hours': rounded(row.overtimeHours),
      'Days Amount': rounded(calculateDaysAmount(row.mRate, row.presentDays, row.totalDays)),
      'OT Amount': rounded(calculateOtAmount(row.mRate, row.overtimeHours, row.totalDays)),
      'Total Earnings': rounded(calculateDaysAmount(row.mRate, row.presentDays, row.totalDays) + calculateOtAmount(row.mRate, row.overtimeHours, row.totalDays)),
      PLWF: rounded(row.plwf),
      PF: rounded(row.pf),
      'Prof. Tax': rounded(row.profTax),
      Advance: rounded(row.advance),
      'PF Vol': rounded(row.pfVol),
      ESI: rounded(row.esi),
      TDS: rounded(row.tds),
      'Total Deductions': rounded(row.totalDeductions),
      'Final Amount': rounded(row.finalAmount),
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    applyExcelTableStyle(worksheet, Object.keys(exportRows[0] || {}).length, exportRows.length, {
      widths: [8, 12, 22, 18, 18, 18, 12, 14, 14, 12, 12, 14, 12, 12, 14, 14, 14, 12, 12, 14, 12, 14, 14, 14, 14, 14],
      headerFill: 'D9EAF7',
      headerFont: '173F73',
    })
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Salary Breakups')
    XLSX.writeFile(workbook, `Salary Breakups ${String(monthNumberMap[selectedMonth]).padStart(2, '0')}-${selectedYear}.xlsx`)
  }

  const showSwal = (title, text, kind = 'success') => {
    setSwalState({ open: true, title, text, kind })
  }

  const formatDateLabel = (dateString) =>
    new Date(`${dateString}T00:00:00`).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

  const closeFinalizeDialog = () => {
    setFinalizeDialog({
      open: false,
      loading: false,
      month: null,
      year: null,
      missingDates: [],
      finalized: false,
      hasAttendanceData: true,
    })
  }

  const handleFinalizePreviousMonth = async () => {
    if (isMarch2026) {
      showSwal('Finalize Blocked', 'March 2026 records are not handled by this software.', 'error')
      return
    }

    try {
      setFinalizeDialog({
        open: true,
        loading: true,
        month: targetMonthNumber,
        year: targetMonthYear,
        missingDates: [],
        finalized: false,
        hasAttendanceData: true,
      })

      const { response, data } = await fetchJson(
        `${API_URL}/api/hr/attendance/month-status?month=${targetMonthNumber}&year=${targetMonthYear}`,
      )

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Unable to verify attendance completeness.')
      }

      const hasAttendanceData = Boolean(data.hasAttendanceData) || Number(data.attendanceCount || 0) > 0
      const missingDates = Array.isArray(data.missingDates) ? data.missingDates : []

      setFinalizeDialog({
        open: true,
        loading: false,
        month: targetMonthNumber,
        year: targetMonthYear,
        missingDates: hasAttendanceData ? missingDates : [],
        finalized: Boolean(finalizationState.finalized),
        hasAttendanceData,
      })
    } catch (err) {
      setFinalizeDialog({
        open: false,
        loading: false,
        month: null,
        year: null,
        missingDates: [],
        finalized: false,
        hasAttendanceData: true,
      })
      showSwal('Finalize Check Failed', err.message || 'Unable to verify attendance completeness.', 'error')
    }
  }

  const finalizeSalary = async () => {
    if (!finalizeDialog.month || !finalizeDialog.year) {
      return
    }

    if (finalizeDialog.missingDates.length > 0) {
      return
    }

    try {
      setFinalizeDialog((current) => ({ ...current, loading: true }))
      const { response, data } = await fetchJson(`${API_URL}/api/salary-breakups/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: finalizeDialog.month,
          year: finalizeDialog.year,
        }),
      })

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Unable to finalize salary.')
      }

      closeFinalizeDialog()
      await loadEmployeeData()
      setFinalizationState({ loading: false, finalized: { month: finalizeDialog.month, year: finalizeDialog.year } })
      showSwal(
        'Finalized',
        `Salary for ${targetMonthName} ${targetMonthYear} has been finalized successfully.`,
        'success',
      )
    } catch (err) {
      setFinalizeDialog((current) => ({ ...current, loading: false }))
      showSwal('Finalize Failed', err.message || 'Unable to finalize salary.', 'error')
    }
  }

  return (
    <div className={`page-stack ${isReadOnlyRole ? 'role-readonly' : ''}`}>
      <section className="welcome-card salary-card">
        <div>
          <p className="eyebrow">Salary Norms</p>
          <h2>Salary Breakups</h2>
          <p>
            Salary breakup values are populated from the Employee Attendance import and the saved payroll records.
          </p>
          <p className="demo-hint" style={{ marginTop: '6px' }}>
            ESI is visible here when the employee master value is Yes, and it is calculated as 0.75% of the derived Basic Salary.
          </p>
        </div>
        {finalizationState.finalized ? <span className="status-badge finalized">Finalized</span> : null}
      </section>

      <section className="toolbar-card">
        <div className="filters-row" style={{ alignItems: 'flex-end' }}>
          <div className="select-group">
            <label htmlFor="month-select">Month</label>
            <select id="month-select" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              {months.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </div>

          <div className="select-group">
            <label htmlFor="year-select">Year</label>
            <select id="year-select" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {canShowFinalizeButton && canEdit ? (
            <button
              type="button"
              className="secondary-btn"
              style={{ marginLeft: 'auto' }}
              onClick={handleFinalizePreviousMonth}
            >
              {finalizationState.finalized ? 'Re-finalize' : 'Finalize'} Salary for {targetMonthName} {targetMonthYear}
            </button>
          ) : null}
        </div>
        <p className="demo-hint" style={{ marginTop: '10px' }}>
          Total Days is the number of calendar days in the selected month and year.
        </p>
      </section>

      {loading ? <p className="form-error">Loading workbook...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="table-card">
        <div className="section-header attendance-table-header">
          <div>
            <p className="eyebrow">Workbook Import</p>
            <h2>Salary Breakup Records</h2>
          </div>
          {canEdit ? <button type="button" className="secondary-btn" onClick={downloadSalaryBreakups}>Download Excel</button> : null}
        </div>

        <div className="filters-row" style={{ marginBottom: '1rem' }}>
          <div className="select-group" style={{ minWidth: '220px' }}>
            <label htmlFor="salary-company-filter">Company</label>
            <select id="salary-company-filter" value={selectedCompany} onChange={(event) => setSelectedCompany(event.target.value)}>
              {companyOptions.map((company) => <option key={company} value={company}>{company === 'all' ? 'All Companies' : company}</option>)}
            </select>
          </div>
          <div className="select-group" style={{ minWidth: '240px' }}>
            <label htmlFor="salary-department-filter">Department</label>
            <select
              id="salary-department-filter"
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
            <label htmlFor="salary-search">Search</label>
            <input
              id="salary-search"
              type="search"
              placeholder="Search by any cell..."
              value={searchTerm}
              readOnly={!canEdit}
              disabled={!canEdit}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="sticky-col sticky-col-1" rowSpan="2">S.no.</th>
                <th className="sticky-col sticky-col-2" rowSpan="2">Emp ID</th>
                <th className="sticky-col sticky-col-3" rowSpan="2">Employee Name</th>
                <th rowSpan="2">Father&apos;s Name</th>
                <th rowSpan="2">Company</th>
                <th rowSpan="2">Department</th>
                <th rowSpan="2">MRate</th>
                <th rowSpan="2">Basic Salary</th>
                <th rowSpan="2">Month</th>
                <th rowSpan="2">Year</th>
                <th colSpan="2">Days</th>
                <th rowSpan="2">OT Hours</th>
                <th className="earnings-header" rowSpan="2">Days Amount</th>
                <th className="earnings-header" rowSpan="2">OT Amount</th>
                <th className="earnings-header" rowSpan="2">Total Earnings</th>
                <th className="deductions-header" colSpan="7">Deductions</th>
                <th className="deductions-header" rowSpan="2">Total Deductions</th>
                <th rowSpan="2">Final Amount</th>
              </tr>
              <tr>
                <th>Present Days</th>
                <th>Total Days</th>
                <th className="deductions-header">PLWF</th>
                <th className="deductions-header">PF</th>
                <th className="deductions-header">Prof. Tax</th>
                <th className="deductions-header">PF Vol</th>
                <th className="deductions-header">ESI</th>
                <th className="deductions-header">TDS</th>
                <th className="deductions-header">Advance</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length > 0 ? (
                paginatedRows.map((row, index) => (
                  <tr key={`${row.empId || row.id || index}`}>
                    <td className="sticky-col sticky-col-1">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td className="sticky-col sticky-col-2">{row.empId}</td>
                    <td className="sticky-col sticky-col-3">{row.employeeName}</td>
                    <td>{row.fatherName}</td>
                    <td>{row.company || ''}</td>
                    <td>{row.department}</td>
                    <td>{Number.isFinite(row.mRate) ? row.mRate.toFixed(2) : ''}</td>
                    <td>{row.basicSalary ? row.basicSalary.toFixed(2) : ''}</td>
                    <td>{selectedMonth}</td>
                    <td>{selectedYear}</td>
                    <td>{row.presentDays}</td>
                    <td>{row.totalDays}</td>
                    <td>{row.overtimeHours.toFixed(2)}</td>
                    <td className="earnings-cell">{calculateDaysAmount(row.mRate, row.presentDays, row.totalDays).toFixed(2)}</td>
                    <td className="earnings-cell">{calculateOtAmount(row.mRate, row.overtimeHours, row.totalDays).toFixed(2)}</td>
                    <td className="earnings-cell">{(calculateDaysAmount(row.mRate, row.presentDays, row.totalDays) + calculateOtAmount(row.mRate, row.overtimeHours, row.totalDays)).toFixed(2)}</td>
                    <td className="deductions-cell">{row.plwf.toFixed(2)}</td>
                    <td className="deductions-cell">{row.pf.toFixed(2)}</td>
                    <td className="deductions-cell">{row.profTax.toFixed(2)}</td>
                    <td className="deductions-cell">{row.pfVol.toFixed(2)}</td>
                    <td className="deductions-cell">{row.esi.toFixed(2)}</td>
                    <td className="deductions-cell">{row.tds.toFixed(2)}</td>
                    <td className="deductions-cell">{row.advance.toFixed(2)}</td>
                    <td className="deductions-cell">{row.totalDeductions.toFixed(2)}</td>
                    <td>{row.finalAmount.toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty-state-cell" colSpan={25}>
                    No Salary Breakups records are available for {selectedMonth} {selectedYear}. Import that month&apos;s employee salary workbook first.
                  </td>
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
        open={swalState.open}
        title={swalState.title}
        text={swalState.text}
        kind={swalState.kind}
        onClose={() => setSwalState((current) => ({ ...current, open: false }))}
      />

      {finalizeDialog.open ? (
        <div className="swal-backdrop">
          <div className="swal-card finalize-card">
            <h3>Finalize Salary for {targetMonthName} {targetMonthYear}</h3>
          {finalizeDialog.loading ? (
            <p>Checking attendance records...</p>
            ) : !finalizeDialog.hasAttendanceData ? (
              <>
                <p>No attendance data is available for this month yet.</p>
                <p>Please upload the Attendance file first.</p>
                <div className="modal-actions">
                  <button type="button" className="secondary-btn" onClick={closeFinalizeDialog}>
                    Close
                  </button>
                </div>
              </>
            ) : finalizeDialog.missingDates.length > 0 ? (
              <>
                <p>The following attendance dates are still missing:</p>
                <div className="missing-dates-list">
                  {finalizeDialog.missingDates.map((date) => (
                    <span key={date} className="missing-date-pill">
                      {formatDateLabel(date)}
                    </span>
                  ))}
                </div>
                <div className="modal-actions">
                  <button type="button" className="secondary-btn" onClick={closeFinalizeDialog}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>Complete attendance is marked for this month. Finalize salary now?</p>
                <div className="modal-actions">
                  <button type="button" className="secondary-btn" onClick={closeFinalizeDialog} disabled={finalizeDialog.loading}>
                    Cancel
                  </button>
                  <button type="button" className="primary-btn" onClick={finalizeSalary} disabled={finalizeDialog.loading}>
                    Finalize
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default SalaryBreakupsPage
