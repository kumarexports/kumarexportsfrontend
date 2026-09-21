import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import SwalDialog from '../components/SwalDialog'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const REQUIRED_HEADERS = [
  'S.no.',
  'Emp ID',
  'Name',
  "Father's Name",
  'Department',
  'Company',
  'MRATE',
  'Gross Salary',
  'PF',
  'PFVOL',
  'ESI',
  'TDS',
  'PROF.TAX',
]

const normalizeHeader = (value) => String(value ?? '').trim().replace(/\s+/g, ' ')

const normalizeYesNo = (value) => {
  const text = String(value ?? '').trim().toLowerCase()
  if (['yes', 'y', 'true', '1'].includes(text)) return 'Yes'
  if (['no', 'n', 'false', '0'].includes(text)) return 'No'
  return value ? 'Yes' : 'No'
}

const normalizeNumber = (value) => {
  const cleaned = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
    .trim()
  return cleaned === '' ? '' : Number.isFinite(Number(cleaned)) ? Number(cleaned) : ''
}

function EmployeesPage() {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [summary, setSummary] = useState('')
  const [uploading, setUploading] = useState(false)
  const [employees, setEmployees] = useState([])
  const [employeesLoading, setEmployeesLoading] = useState(false)
  const [viewMode, setViewMode] = useState('imported')
  const [searchText, setSearchText] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [swal, setSwal] = useState({ open: false, title: '', text: '', kind: 'error' })
  const fileInputRef = useRef(null)

  const loadEmployees = async () => {
    setEmployeesLoading(true)
    try {
      const token = JSON.parse(localStorage.getItem('kumarexports-auth-user') || '{}')?.token
      const response = await fetch(`${API_URL}/api/hr/employees`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await response.json()
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Unable to load employees.')
      }
      setEmployees(Array.isArray(data.employees) ? data.employees : [])
    } catch (err) {
      setSwal({ open: true, title: 'Employees Error', text: err.message || 'Unable to load employees.', kind: 'error' })
    } finally {
      setEmployeesLoading(false)
    }
  }

  const updateEmployeeEsi = async (row, esiValue) => {
    setRows((current) => current.map((item) => item === row ? { ...item, esi: esiValue } : item))
    const employee = employees.find((item) => String(item.empId) === String(row.empId) && String(item.company || '').trim() === String(row.company || '').trim())
    if (!employee?.id) return
    try {
      const token = JSON.parse(localStorage.getItem('kumarexports-auth-user') || '{}')?.token
      const response = await fetch(`${API_URL}/api/hr/employees/${employee.id}/esi`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ esi: esiValue }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to update ESI value.')
      await loadEmployees()
    } catch (err) {
      setSwal({ open: true, title: 'Update Failed', text: err.message || 'Unable to update ESI value.', kind: 'error' })
    }
  }

  const updateEmployeePf = async (row, pfValue) => {
    setRows((current) => current.map((item) => item === row ? { ...item, pf: pfValue } : item))
    const employee = employees.find((item) => String(item.empId) === String(row.empId) && String(item.company || '').trim() === String(row.company || '').trim())
    if (!employee?.id) return
    try {
      const token = JSON.parse(localStorage.getItem('kumarexports-auth-user') || '{}')?.token
      const response = await fetch(`${API_URL}/api/hr/employees/${employee.id}/pf`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ pf: pfValue }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to update PF value.')
      await loadEmployees()
    } catch (err) {
      setSwal({ open: true, title: 'Update Failed', text: err.message || 'Unable to update PF value.', kind: 'error' })
    }
  }

  const importEmployees = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    try {
      setSummary('')
      setRows([])
      setFileName(file.name)

      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: true })
      const sheetName = workbook.SheetNames[0]

      if (!sheetName) {
        throw new Error('No worksheet found in the uploaded file.')
      }

      const sheet = workbook.Sheets[sheetName]
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
      const cleanedRows = rawRows.filter((row) => Array.isArray(row) && row.some((cell) => cell !== '' && cell !== null && cell !== undefined))
      const headerRow = cleanedRows[0] || []
      const normalizedHeaders = headerRow.map(normalizeHeader)

      const missingHeaders = REQUIRED_HEADERS.filter((header) => !normalizedHeaders.includes(header))
      if (missingHeaders.length) {
        throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`)
      }

      const importedRows = cleanedRows.slice(1).map((row, index) => {
        const record = {}
        headerRow.forEach((header, headerIndex) => {
          record[normalizeHeader(header)] = row[headerIndex]
        })

        return {
          sno: normalizeNumber(record['S.no.']) || index + 1,
          empId: String(record['Emp ID'] ?? '').trim(),
          name: String(record.Name ?? '').trim(),
          fatherName: String(record["Father's Name"] ?? '').trim(),
          department: String(record.Department ?? '').trim(),
          company: String(record.Company ?? '').trim(),
          mrate: normalizeNumber(record.MRATE),
          basic: normalizeNumber(record['Gross Salary']),
          pf: normalizeYesNo(record.PF),
          pfvol: normalizeNumber(record.PFVOL),
          esi: normalizeYesNo(record.ESI),
          tds: normalizeNumber(record.TDS),
          profTax: normalizeNumber(record['PROF.TAX']),
        }
      }).filter((row) => row.empId || row.name || row.department)

      if (!importedRows.length) {
        throw new Error('No valid employee rows were found in the uploaded file.')
      }

      const invalidSalary = importedRows.find((row) => row.basic < 21536)
      if (invalidSalary) {
        throw new Error(`${invalidSalary.empId || invalidSalary.name}: Gross Salary must be at least ₹21,536.`)
      }

      setUploading(true)
      const token = JSON.parse(localStorage.getItem('kumarexports-auth-user') || '{}')?.token
      const now = new Date()
      const response = await fetch(`${API_URL}/api/hr/employees/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          employees: importedRows.map((row) => ({
            sno: row.sno,
            empId: row.empId,
            employeeName: row.name,
            fatherName: row.fatherName,
            department: row.department,
            company: row.company,
            mrate: row.mrate,
            basic: row.basic,
            pf: row.pf,
            pfvol: row.pfvol,
            esi: row.esi,
            tds: row.tds,
            profTax: row.profTax,
          })),
          sourceFileName: file.name,
          payrollMonth: now.getMonth() + 1,
          payrollYear: now.getFullYear(),
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Unable to upload employee master file.')
      }

      setRows(importedRows)
      setSummary(`Uploaded ${importedRows.length} employee rows from ${file.name}.`)
      await loadEmployees()
    } catch (err) {
      setSwal({ open: true, title: 'Import Failed', text: err.message || 'Unable to import employee file.', kind: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const toggleEmployeeActive = async (employeeId) => {
    try {
      const token = JSON.parse(localStorage.getItem('kumarexports-auth-user') || '{}')?.token
      const response = await fetch(`${API_URL}/api/hr/employees/${employeeId}/toggle-active`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await response.json()
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Unable to update employee status.')
      }
      await loadEmployees()
    } catch (err) {
      setSwal({ open: true, title: 'Update Failed', text: err.message || 'Unable to update employee status.', kind: 'error' })
    }
  }

  const handleViewModeChange = async (mode) => {
    setViewMode(mode)
    if (mode !== 'imported' && !employees.length) {
      await loadEmployees()
    }
  }

  const activeEmployees = employees.filter((employee) => employee.is_active !== false)
  const inactiveEmployees = employees.filter((employee) => employee.is_active === false)
  const importedEmployees = rows.length
    ? rows
    : employees.map((employee, index) => ({
        sno: employee.sno ?? index + 1,
        empId: employee.empId,
        name: employee.employeeName,
        fatherName: employee.fatherName,
        department: employee.department,
        company: employee.company ?? employee.Company ?? employee.importData?.company ?? '',
        mrate: employee.masterMRate ?? employee.monthlyMRate ?? '',
        basic: employee.basicPackage ?? employee.totalBasicPackage ?? employee.basicSalary ?? '',
        pf: employee.pfValue ?? employee.importData?.deductions?.pf?.raw ?? employee.importData?.deductions?.pf?.amount ?? '',
        pfvol: employee.pfvolValue ?? employee.importData?.deductions?.pfvol?.raw ?? employee.importData?.deductions?.pfvol?.amount ?? '',
        esi: employee.esiValue ?? employee.importData?.deductions?.esi?.raw ?? employee.importData?.deductions?.esi?.amount ?? '',
        tds: employee.tdsValue ?? employee.importData?.deductions?.tds?.raw ?? employee.importData?.deductions?.tds?.amount ?? '',
        profTax: employee.profTaxValue ?? employee.importData?.deductions?.profTax?.raw ?? employee.importData?.deductions?.profTax?.amount ?? '',
      }))

  const uniqueByEmpId = (list) => {
    const seen = new Set()
    return list.filter((employee) => {
      const key = String(employee.empId || '').trim()
      if (!key || seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  const uniqueImportedEmployees = useMemo(() => uniqueByEmpId(importedEmployees), [importedEmployees])
  const uniqueActiveEmployees = useMemo(() => uniqueByEmpId(activeEmployees), [activeEmployees])
  const uniqueInactiveEmployees = useMemo(() => uniqueByEmpId(inactiveEmployees), [inactiveEmployees])
  const departmentOptions = useMemo(() => {
    const source = viewMode === 'imported' ? uniqueImportedEmployees : viewMode === 'active' ? uniqueActiveEmployees : uniqueInactiveEmployees
    return Array.from(new Set(source.map((employee) => String(employee.department || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [uniqueActiveEmployees, uniqueInactiveEmployees, uniqueImportedEmployees, viewMode])

  const companyOptions = useMemo(() => {
    const source = viewMode === 'imported' ? uniqueImportedEmployees : viewMode === 'active' ? uniqueActiveEmployees : uniqueInactiveEmployees
    return Array.from(new Set(source.map((employee) => String(employee.company || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [uniqueActiveEmployees, uniqueInactiveEmployees, uniqueImportedEmployees, viewMode])

  const filteredEmployees = useMemo(() => {
    const source = viewMode === 'imported' ? uniqueImportedEmployees : viewMode === 'active' ? uniqueActiveEmployees : uniqueInactiveEmployees
    const search = searchText.trim().toLowerCase()
    return source.filter((employee) => {
      const companyValue = String(employee.company || '').trim()
      const departmentValue = String(employee.department || '').trim()
      const matchesCompany = companyFilter === 'all' || companyValue === companyFilter
      const matchesDepartment = departmentFilter === 'all' || departmentValue === departmentFilter
      const haystack = [
        employee.empId,
        employee.name ?? employee.employeeName,
        employee.fatherName,
        companyValue,
        departmentValue,
        employee.company,
        employee.mrate,
        employee.basic,
        employee.pf,
        employee.pfvol,
        employee.esi,
        employee.tds,
        employee.profTax,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')
      const matchesSearch = !search || haystack.includes(search)
      return matchesCompany && matchesDepartment && matchesSearch
    })
  }, [companyFilter, departmentFilter, searchText, uniqueActiveEmployees, uniqueInactiveEmployees, uniqueImportedEmployees, viewMode])

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize))
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    void loadEmployees()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [viewMode, searchText, companyFilter, departmentFilter, pageSize])

  const columnCount = useMemo(() => REQUIRED_HEADERS.length, [])

  return (
    <div className="page-stack">
      <section className="welcome-card">
        <div>
          <p className="eyebrow">Masters</p>
          <h2>Employees</h2>
          <p>Upload `Employees.xlsx` with the master data columns below.</p>
        </div>

        <button type="button" className="secondary-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Import Employee Excel'}
        </button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={importEmployees} />
      </section>

      {summary ? <p className="success-text">{summary}</p> : null}

      <section className="table-card">
        <div className="section-header attendance-table-header" style={{ marginBottom: '16px' }}>
          <div>
            <p className="eyebrow">Template</p>
            <h2>Required Columns</h2>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {REQUIRED_HEADERS.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={columnCount} className="card-note">
                  {fileName ? `Loaded ${fileName}.` : 'Upload Employees.xlsx with the exact columns shown above. ESI must be Yes or No.'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-card">
        <div className="section-header attendance-table-header" style={{ marginBottom: '16px' }}>
          <div>
            <p className="eyebrow">Records</p>
            <h2>Imported | Active | Inactive</h2>
          </div>
        </div>
        <div className="filters-row" style={{ marginBottom: '14px' }}>
          <div className="select-group">
            <label htmlFor="employee-company">Company</label>
            <select id="employee-company" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              <option value="all">All Companies</option>
              {companyOptions.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </div>
          <div className="select-group">
            <label htmlFor="employee-search">Search</label>
            <input
              id="employee-search"
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search employee, ID, department..."
            />
          </div>
          <div className="select-group">
            <label htmlFor="employee-department">Department</label>
            <select id="employee-department" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
              <option value="all">All Departments</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>
          <div className="select-group">
            <label htmlFor="employee-page-size">Rows per page</label>
            <select id="employee-page-size" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value) || 10)}>
              {[5, 10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="tab-toggle" role="tablist" aria-label="Employee data views">
          <button
            type="button"
            className={`tab-toggle-btn${viewMode === 'imported' ? ' active' : ''}`}
            aria-pressed={viewMode === 'imported'}
            onClick={() => setViewMode('imported')}
          >
            Imported
          </button>
          <button
            type="button"
            className={`tab-toggle-btn${viewMode === 'active' ? ' active' : ''}`}
            aria-pressed={viewMode === 'active'}
            onClick={() => void handleViewModeChange('active')}
          >
            Active
          </button>
          <button
            type="button"
            className={`tab-toggle-btn${viewMode === 'inactive' ? ' active' : ''}`}
            aria-pressed={viewMode === 'inactive'}
            onClick={() => void handleViewModeChange('inactive')}
          >
            Inactive
          </button>
        </div>

        <div className="table-scroll" style={{ marginTop: '16px' }}>
          <table>
            <thead>
              {viewMode === 'imported' ? (
                <tr>
                  <th>S.no.</th>
                  <th>Emp ID</th>
                  <th>Name</th>
                  <th>Father&apos;s Name</th>
                  <th>Department</th>
                  <th>Company</th>
                  <th>MRATE</th>
                  <th>Gross Salary</th>
                  <th>PF</th>
                  <th>PFVOL</th>
                  <th>ESI</th>
                  <th>TDS</th>
                  <th>PROF.TAX</th>
                </tr>
              ) : (
                <tr>
                  <th>Emp ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              )}
            </thead>
            <tbody>
              {viewMode === 'imported' ? (
                paginatedEmployees.length ? (
                  paginatedEmployees.map((row) => (
                    <tr key={`${row.empId}-${row.sno}`}>
                      <td>{row.sno}</td>
                      <td>{row.empId}</td>
                      <td>{row.name}</td>
                      <td>{row.fatherName}</td>
                      <td>{row.department}</td>
                      <td>{row.company}</td>
                      <td>{row.mrate ?? ''}</td>
                      <td>{row.basic ?? ''}</td>
                      <td>
                        <select value={row.pf || 'No'} onChange={(event) => void updateEmployeePf(row, event.target.value)}>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </td>
                      <td>{row.pfvol ?? ''}</td>
                      <td>
                        <select value={row.esi || 'No'} onChange={(event) => void updateEmployeeEsi(row, event.target.value)}>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </td>
                      <td>{row.tds ?? ''}</td>
                      <td>{row.profTax ?? ''}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty-state-cell" colSpan={13}>
                      No employee records found in the database.
                    </td>
                  </tr>
                )
              ) : employeesLoading ? (
                <tr>
                  <td className="empty-state-cell" colSpan={5}>
                    Loading employees...
                  </td>
                </tr>
              ) : viewMode === 'active' ? (
                paginatedEmployees.length ? (
                  paginatedEmployees.map((employee) => (
                    <tr key={employee.id}>
                      <td>{employee.empId}</td>
                      <td>{employee.employeeName}</td>
                      <td>{employee.department}</td>
                      <td>{employee.company || ''}</td>
                      <td>Active</td>
                      <td>
                        <button type="button" className="secondary-btn" onClick={() => toggleEmployeeActive(employee.id)}>
                          Mark Inactive
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty-state-cell" colSpan={6}>
                      No active employees found.
                    </td>
                  </tr>
                )
              ) : paginatedEmployees.length ? (
                paginatedEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.empId}</td>
                    <td>{employee.employeeName}</td>
                    <td>{employee.department}</td>
                    <td>{employee.company || ''}</td>
                    <td>Inactive</td>
                    <td>
                      <button type="button" className="secondary-btn" onClick={() => toggleEmployeeActive(employee.id)}>
                        Reactivate
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty-state-cell" colSpan={6}>
                    No inactive employees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <button type="button" className="secondary-btn" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage <= 1}>
            Previous
          </button>
          <span className="pagination-label">
            Page {currentPage} of {Math.max(1, totalPages)} ? {filteredEmployees.length} unique employees
          </span>
          <button type="button" className="secondary-btn" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages}>
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

      {uploading ? (
        <div className="swal-backdrop" aria-live="polite" aria-busy="true">
          <div className="swal-card success import-loader-card">
            <div className="import-loader-spinner" />
            <h3>Importing employee master data</h3>
            <p>Please wait while the file is being validated and saved.</p>
          </div>
        </div>
      ) : null}

    </div>
  )
}

export default EmployeesPage
