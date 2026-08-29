import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx-js-style'
import SwalDialog from '../components/SwalDialog'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const REQUIRED_HEADERS = [
  'EmpID',
  'Employee Name',
  "Father's Name",
  'Department',
  'Basic Salary',
  'Present Days',
  'Total Days',
  'PF',
  'PFVOL',
  'ESI',
  'TDS',
  'Advance',
  'PLWF',
  'PROF. TAX',
  'Net Amount',
]

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
  if (!response.ok || !data?.ok) throw new Error(data?.error || `Unable to load direct salary records. (${response.status})`)
  return data
}

const normalizeHeader = (value) => String(value ?? '').trim().replace(/\s+/g, ' ')
const parseNum = (value) => {
  const normalized = String(value ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '').trim()
  return normalized === '' ? 0 : Number(normalized) || 0
}
const money = (value) => Number(value || 0).toFixed(2)

function DirectSalaryCalculationPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [swal, setSwal] = useState({ open: false, title: '', text: '', kind: 'success' })
  const [pendingReset, setPendingReset] = useState(false)
  const fileInputRef = useRef(null)
  const pageSize = 15

  const loadRows = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await fetchJson(`${API_URL}/api/reports/direct-salary`)
      setRows(Array.isArray(data.rows) ? data.rows : [])
    } catch (err) {
      setRows([])
      setError(err.message || 'Unable to load direct salary records.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  const calcDerived = (row) => {
    const importedBasic = parseNum(row.import_data?.sourceBasicSalary ?? row.import_data?.importedBasicSalary)
    const presentDays = parseNum(row.present_days)
    const totalDays = Math.max(1, parseNum(row.total_days))
    const baseBasic = importedBasic > 0 ? importedBasic : parseNum(row.basic_salary)
    const targetNet = parseNum(row.import_data?.targetNetAmount ?? row.import_data?.netAmount ?? row.net_amount)
    const fixedOt = Math.max(0, parseNum(row.import_data?.otAllowance || row.ot_allowance))
    const fixedIncentive = Math.max(0, parseNum(row.import_data?.incentives || row.incentive))
    const fixedDeductions = parseNum(row.pf) + parseNum(row.pfvol) + parseNum(row.tds) + parseNum(row.advance) + parseNum(row.plwf) + parseNum(row.prof_tax)
    const esiFlag = baseBasic < 21000
    let effectivePresentDays = presentDays
    let basic = Math.round(baseBasic * (effectivePresentDays / totalDays))
    let hra = Math.round(basic * 0.066666667)
    let conveyance = Math.round(basic * 0.266666667)
    let ot = fixedOt
    let incentive = fixedIncentive
    let esi = esiFlag ? Math.round(basic * 0.0075) : 0
    let totalEarnings = basic + hra + conveyance + ot + incentive
    let totalDeductions = fixedDeductions + esi
    let netAmount = totalEarnings - totalDeductions
    const desiredNet = targetNet > 0 ? targetNet : netAmount

    if (netAmount > desiredNet) {
      while (effectivePresentDays > 0) {
        const nextPresentDays = effectivePresentDays - 1
        const nextBasic = Math.round(baseBasic * (nextPresentDays / totalDays))
        const nextHra = Math.round(nextBasic * 0.066666667)
        const nextConveyance = Math.round(nextBasic * 0.266666667)
        const nextEsi = esiFlag ? Math.round(nextBasic * 0.0075) : 0
        const nextNet = (nextBasic + nextHra + nextConveyance + ot + incentive) - (fixedDeductions + nextEsi)
        effectivePresentDays = nextPresentDays
        basic = nextBasic
        hra = nextHra
        conveyance = nextConveyance
        esi = nextEsi
        netAmount = nextNet
        if (nextNet <= desiredNet) break
      }
    }

    if (netAmount < desiredNet) {
      const gap = desiredNet - netAmount
      const otIncrease = Math.min(350, gap)
      ot += otIncrease
      incentive += Math.max(0, gap - otIncrease)
    }

    totalEarnings = basic + hra + conveyance + ot + incentive
    esi = esiFlag ? Math.round(basic * 0.0075) : 0
    totalDeductions = fixedDeductions + esi
    netAmount = totalEarnings - totalDeductions

    if (netAmount !== desiredNet) {
      const remainder = desiredNet - netAmount
      incentive = Math.max(0, incentive + remainder)
      totalEarnings = basic + hra + conveyance + ot + incentive
      esi = esiFlag ? Math.round(basic * 0.0075) : 0
      totalDeductions = fixedDeductions + esi
      netAmount = totalEarnings - totalDeductions
    }

    const extraAbsentDays = Math.max(0, Math.round(presentDays - effectivePresentDays))

    return {
      basic,
      hra,
      conveyance,
      esi,
      ot,
      incentive,
      productionIncentives: Number((ot + incentive).toFixed(2)),
      totalEarnings,
      totalDeductions,
      netAmount,
      extraAbsentDays,
    }
  }

  const downloadExcel = () => {
    if (!paginatedRows.length) return
    const rounded = (value) => Math.round(Number(value || 0))

    const exportRows = paginatedRows.map((row, index) => {
      const calc = calcDerived(row)
      return {
        'S.No': (currentPage - 1) * pageSize + index + 1,
        EmpID: row.emp_id,
        'Employee Name': row.employee_name,
        "Father's Name": row.father_name,
        Department: row.department,
        'Present Days': rounded(row.present_days),
        'Total Days': rounded(row.total_days),
        'Basic Salary': rounded(calc.basic),
        HRA: rounded(calc.hra),
        'Conveyance Allowance': rounded(calc.conveyance),
        'Production Incentives': rounded(calc.productionIncentives),
        'Total Earnings': rounded(calc.totalEarnings),
        PF: rounded(row.pf),
        PFVOL: rounded(row.pfvol),
        ESI: rounded(calc.esi),
        TDS: rounded(row.tds),
        Advance: rounded(row.advance),
        PLWF: rounded(row.plwf),
        'PROF. TAX': rounded(row.prof_tax),
        'Total Deductions': rounded(calc.totalDeductions),
        'Net Amount': rounded(calc.netAmount),
        'Extra Days Absent': rounded(calc.extraAbsentDays),
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const headerStyle = {
      fill: { fgColor: { rgb: 'C6EFCE' } },
      font: { bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
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

    Object.keys(exportRows[0] || {}).forEach((_, index) => {
      const column = XLSX.utils.encode_col(index)
      const headerCell = `${column}1`
      if (worksheet[headerCell]) {
        worksheet[headerCell].s = headerStyle
      }
      for (let rowIndex = 2; rowIndex <= exportRows.length + 1; rowIndex += 1) {
        const cellRef = `${column}${rowIndex}`
        if (worksheet[cellRef]) {
          worksheet[cellRef].s = { border: bodyBorder }
        }
      }
    })

    worksheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(Object.keys(exportRows[0] || {}).length - 1)}${exportRows.length + 1}` }
    worksheet['!cols'] = Object.keys(exportRows[0] || {}).map((key) => ({
      wch: Math.max(
        key.length + 2,
        ...exportRows.map((row) => String(row[key] ?? '').length + 2),
      ),
    }))

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Direct Salary')
    XLSX.writeFile(workbook, 'Direct Salary Calculation.xlsx')
  }

  const downloadAllExcel = () => {
    if (!filteredRows.length) return
    const rounded = (value) => Math.round(Number(value || 0))

    const exportRows = filteredRows.map((row, index) => {
      const calc = calcDerived(row)
      return {
        'S.No': index + 1,
        EmpID: row.emp_id,
        'Employee Name': row.employee_name,
        "Father's Name": row.father_name,
        Department: row.department,
        'Present Days': rounded(row.present_days),
        'Total Days': rounded(row.total_days),
        'Basic Salary': rounded(calc.basic),
        HRA: rounded(calc.hra),
        'Conveyance Allowance': rounded(calc.conveyance),
        'Production Incentives': rounded(calc.productionIncentives),
        'Total Earnings': rounded(calc.totalEarnings),
        PF: rounded(row.pf),
        PFVOL: rounded(row.pfvol),
        ESI: rounded(calc.esi),
        TDS: rounded(row.tds),
        Advance: rounded(row.advance),
        PLWF: rounded(row.plwf),
        'PROF. TAX': rounded(row.prof_tax),
        'Total Deductions': rounded(calc.totalDeductions),
        'Net Amount': rounded(calc.netAmount),
        'Extra Days Absent': rounded(calc.extraAbsentDays),
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const headerStyle = {
      fill: { fgColor: { rgb: 'C6EFCE' } },
      font: { bold: true, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
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

    Object.keys(exportRows[0] || {}).forEach((_, index) => {
      const column = XLSX.utils.encode_col(index)
      const headerCell = `${column}1`
      if (worksheet[headerCell]) {
        worksheet[headerCell].s = headerStyle
      }
      for (let rowIndex = 2; rowIndex <= exportRows.length + 1; rowIndex += 1) {
        const cellRef = `${column}${rowIndex}`
        if (worksheet[cellRef]) {
          worksheet[cellRef].s = { border: bodyBorder }
        }
      }
    })

    worksheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(Object.keys(exportRows[0] || {}).length - 1)}${exportRows.length + 1}` }
    worksheet['!cols'] = Object.keys(exportRows[0] || {}).map((key) => ({
      wch: Math.max(
        key.length + 2,
        ...exportRows.map((row) => String(row[key] ?? '').length + 2),
      ),
    }))

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Direct Salary')
    XLSX.writeFile(workbook, 'Direct Salary Calculation - All Data.xlsx')
  }

  const resetAllRows = async () => {
    setPendingReset(true)
    setSwal({
      open: true,
      title: 'Reset Direct Salary',
      text: 'This will delete all Direct Salary Calculation records from the database. Continue?',
      kind: 'warning',
    })
  }

  const confirmResetAllRows = async () => {
    try {
      setUploading(true)
      await fetchJson(`${API_URL}/api/reports/direct-salary`, { method: 'DELETE' })
      await loadRows()
      setPendingReset(false)
      setSwal({ open: true, title: 'Reset Successful', text: 'All Direct Salary records were deleted successfully.', kind: 'success' })
    } catch (err) {
      setSwal({ open: true, title: 'Reset Failed', text: err.message || 'Unable to reset Direct Salary records.', kind: 'error' })
    } finally {
      setUploading(false)
      setPendingReset(false)
    }
  }

  const sortedRows = useMemo(() => {
    const getEmpIdSortValue = (row) => {
      const numeric = Number.parseFloat(String(row.emp_id ?? '').replace(/[^\d.-]/g, ''))
      if (Number.isFinite(numeric)) return numeric
      return String(row.emp_id ?? '').toLowerCase()
    }

    return [...rows].sort((a, b) => {
      const aValue = getEmpIdSortValue(a)
      const bValue = getEmpIdSortValue(b)
      if (typeof aValue === 'number' && typeof bValue === 'number') return aValue - bValue
      return String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' })
    })
  }, [rows])

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return sortedRows

    return sortedRows.filter((row) => {
      const values = [
        row.emp_id,
        row.employee_name,
        row.father_name,
        row.department,
        row.present_days,
        row.total_days,
        row.net_amount,
      ]
      return values.some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [searchTerm, sortedRows])

  const totalRows = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const paginatedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredRows],
  )

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const importDirectSalary = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setUploading(true)
      setError('')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error('No worksheet found in the uploaded file.')
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
      const cleaned = rawRows.filter((row) => Array.isArray(row) && row.some((cell) => cell !== '' && cell !== null && cell !== undefined))
      const headerRow = cleaned[0] || []
      const headers = headerRow.map(normalizeHeader)
      const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(normalizeHeader(header)))
      if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`)

      const importedRows = cleaned.slice(1).map((row) => {
        const record = {}
        headerRow.forEach((header, index) => {
          record[normalizeHeader(header)] = row[index]
        })
        return {
          empId: String(record.EmpID ?? record['Emp ID'] ?? '').trim(),
          employeeName: String(record['Employee Name'] ?? '').trim(),
          fatherName: String(record["Father's Name"] ?? '').trim(),
          department: String(record.Department ?? '').trim(),
          sourceBasicSalary: parseNum(record['Basic Salary']),
          basicSalary: parseNum(record['Basic Salary']),
          presentDays: parseNum(record['Present Days']),
          totalDays: parseNum(record['Total Days']),
          pf: parseNum(record.PF),
          pfvol: parseNum(record.PFVOL),
          esi: parseNum(record.ESI),
          tds: parseNum(record.TDS),
          advance: parseNum(record.Advance),
          plwf: parseNum(record.PLWF),
          profTax: parseNum(record['PROF. TAX']),
          netAmount: parseNum(record['Net Amount']),
        }
      }).filter((row) => row.empId || row.employeeName)

      const data = await fetchJson(`${API_URL}/api/reports/direct-salary/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: importedRows }),
      })
      await loadRows()
      setSwal({ open: true, title: 'Import Successful', text: `Imported ${data.count || importedRows.length} rows successfully.`, kind: 'success' })
    } catch (err) {
      setError(err.message || 'Unable to import direct salary file.')
      setSwal({ open: true, title: 'Import Failed', text: err.message || 'Unable to import direct salary file.', kind: 'error' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="welcome-card salary-card">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Direct Salary Calculation</h2>
          <p>Import the salary sheet and the saved rows will be calculated and displayed from the database.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" className="secondary-btn" onClick={downloadAllExcel} disabled={!filteredRows.length}>
            Download All Data Excel
          </button>
          <button type="button" className="danger-btn" onClick={resetAllRows} disabled={uploading || loading || !rows.length}>
            Reset Table
          </button>
        </div>
      </section>

      <section className="toolbar-card">
        <div className="filters-row" style={{ alignItems: 'flex-end' }}>
          <div className="select-group">
            <label htmlFor="direct-salary-file">Import File</label>
            <input
              id="direct-salary-file"
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={importDirectSalary}
              disabled={uploading}
            />
          </div>
          <div className="select-group" style={{ minWidth: '260px' }}>
            <label htmlFor="direct-salary-search">Search</label>
            <input
              id="direct-salary-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by EmpID, name, department"
            />
          </div>
        </div>
      </section>

      {loading ? <p className="form-error">Loading direct salary records...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <section className="table-card">
        <div className="section-header attendance-table-header">
          <div>
            <p className="eyebrow">Stored Records</p>
            <h2>{totalRows} Employees</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="secondary-btn" onClick={downloadExcel} disabled={!paginatedRows.length}>
              Download Current View Excel
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th>EmpID</th>
                <th>Employee Name</th>
                <th>Father&apos;s Name</th>
                <th>Department</th>
                <th>Present Days</th>
                <th>Total Days</th>
                <th>Basic Salary</th>
                <th>HRA</th>
                <th>Conveyance Allowance</th>
                <th>Production Incentives</th>
                <th>Total Earnings</th>
                <th>PF</th>
                <th>PFVOL</th>
                <th>ESI</th>
                <th>TDS</th>
                <th>Advance</th>
                <th>PLWF</th>
                <th>PROF. TAX</th>
                <th>Total Deductions</th>
                <th>Net Amount</th>
                <th>Extra Days Absent</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, index) => {
                const calc = calcDerived(row)
                return (
                  <tr key={row.id}>
                    <td>{(currentPage - 1) * pageSize + index + 1}</td>
                    <td>{row.emp_id}</td>
                    <td>{row.employee_name}</td>
                    <td>{row.father_name}</td>
                    <td>{row.department}</td>
                    <td>{money(row.present_days)}</td>
                    <td>{money(row.total_days)}</td>
                    <td>{money(calc.basic)}</td>
                    <td>{money(calc.hra)}</td>
                    <td>{money(calc.conveyance)}</td>
                    <td>{money(calc.productionIncentives)}</td>
                    <td>{money(calc.totalEarnings)}</td>
                    <td>{money(row.pf)}</td>
                    <td>{money(row.pfvol)}</td>
                    <td>{money(calc.esi)}</td>
                    <td>{money(row.tds)}</td>
                    <td>{money(row.advance)}</td>
                    <td>{money(row.plwf)}</td>
                    <td>{money(row.prof_tax)}</td>
                    <td>{money(calc.totalDeductions)}</td>
                    <td>{money(calc.netAmount)}</td>
                    <td>{money(calc.extraAbsentDays)}</td>
                  </tr>
                )
              })}
              {!paginatedRows.length && !loading ? (
                <tr>
                  <td colSpan="24" className="empty-state-cell">
                    No Direct Salary records available. Import the file first.
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

      <SwalDialog
        open={swal.open}
        title={swal.title}
        text={swal.text}
        kind={swal.kind}
        onClose={() => {
          if (pendingReset) {
            setSwal((current) => ({ ...current, open: false }))
            void confirmResetAllRows()
            return
          }
          setSwal((current) => ({ ...current, open: false }))
        }}
      />
    </div>
  )
}

export default DirectSalaryCalculationPage
