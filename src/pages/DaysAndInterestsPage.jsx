import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { applyExcelTableStyle } from '../utils/excelFormatting'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const months = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March']
const monthNumberMap = {
  April: 4, May: 5, June: 6, July: 7, August: 8, September: 9,
  October: 10, November: 11, December: 12, January: 1, February: 2, March: 3,
}
const years = Array.from({ length: 11 }, (_, index) => new Date().getFullYear() + index)
const pageSize = 15

const fetchJson = async (url) => {
  const token = JSON.parse(localStorage.getItem('kumarexports-auth-user') || '{}')?.token
  const response = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok || !data?.ok) throw new Error(data?.error || 'Unable to load Government Salary records.')
  return data
}

const money = (value) => String(Math.round(Number(value || 0)))

function DaysAndInterestsPage() {
  const [selectedMonth, setSelectedMonth] = useState('July')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState([])
  const [employeeRows, setEmployeeRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [finalized, setFinalized] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    const loadRecords = async () => {
      try {
        setLoading(true)
        setError('')
        const month = monthNumberMap[selectedMonth]
        const [statusData, salaryData, employeeData] = await Promise.all([
          fetchJson(`${API_URL}/api/salary-breakups/finalization-status?month=${month}&year=${selectedYear}`),
          fetchJson(`${API_URL}/api/government-salaries?month=${month}&year=${selectedYear}`),
          fetchJson(`${API_URL}/api/hr/employees?month=${month}&year=${selectedYear}`),
        ])
        setFinalized(Boolean(statusData.finalized))
        setRows(salaryData.rows || [])
        setEmployeeRows(employeeData.employees || [])
      } catch (err) {
        setRows([])
        setEmployeeRows([])
        setFinalized(false)
        setError(err.message || 'Unable to load Government Salary records.')
      } finally {
        setLoading(false)
      }
    }
    void loadRecords()
  }, [selectedMonth, selectedYear])

  useEffect(() => setCurrentPage(1), [selectedMonth, selectedYear])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const paginatedRows = useMemo(
    () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, rows],
  )

  const sourceBasicByEmployeeId = useMemo(() => {
    const map = new Map()
    employeeRows.forEach((employee) => {
      const importData = employee.importData && typeof employee.importData === 'object' ? employee.importData : {}
      const sourceBasic = Number(
        employee.basicPackage ||
        importData.basicPackage ||
        importData.basic_salary ||
        importData.basic ||
        0,
      )
      map.set(String(employee.id), sourceBasic)
      map.set(String(employee.empId), sourceBasic)
    })
    return map
  }, [employeeRows])

  const employeeMetaById = useMemo(() => {
    const map = new Map()
    employeeRows.forEach((employee) => {
      map.set(String(employee.id), employee)
      map.set(String(employee.empId), employee)
    })
    return map
  }, [employeeRows])

  const getSourceBasicSalary = (row) => {
    const direct = Number(row.sourceBasicSalary || row.source_basic_salary || 0)
    if (direct > 0) return direct

    const fromEmployee = sourceBasicByEmployeeId.get(String(row.employee_id)) || sourceBasicByEmployeeId.get(String(row.empId)) || 0
    if (fromEmployee > 0) return fromEmployee

    return Number(row.basic_salary || 0)
  }

  const getStoredOrCalculated = (row, primaryKeys, fallbackCalculator) => {
    for (const key of primaryKeys) {
      const value = Number(row?.[key] ?? 0)
      if (value > 0) return value
    }
    return fallbackCalculator(row)
  }

  const getPresentDays = (row) => Number(row.present_days ?? row.presentDays ?? row.source_present_days ?? 0)

  const getFinalSalary = (row) => {
    if (getPresentDays(row) <= 0) return 0
    const storedFinal = Number(
      row.final_salary ??
      row.saved_final_amount ??
      row.net_amount ??
      row.final_amount ??
      0,
    )
    if (storedFinal > 0) {
      return storedFinal
    }

    const sourceBasic = getSourceBasicSalary(row)
    const presentDays = Number(row.present_days || 0)
    const totalDays = Number(row.total_days || 0)
    if (sourceBasic > 0 && totalDays > 0) {
      return Number(((sourceBasic * presentDays) / totalDays).toFixed(2))
    }
    return Number(row.final_salary || row.updated_basic_salary || 0)
  }

  const getDerivedBasicSalary = (row) => {
    return getStoredOrCalculated(row, ['basic_salary', 'basicSalary', 'derived_basic_salary'], () => Number((getFinalSalary(row) * 0.70).toFixed(2)))
  }

  const getPf = (row) => {
    const pfValue = String(row.pfValue ?? row.pf_value ?? '').trim().toLowerCase()
    if (row.pfEnabled === true || ['yes', 'y', 'true', '1'].includes(pfValue)) {
      return Number(Math.min(1800, getDerivedBasicSalary(row) * 0.12).toFixed(2))
    }
    return Number(row.pf || 0)
  }

  const getRemainingBalance = (row) => {
    return getStoredOrCalculated(row, ['remaining_balance'], () => Number((getFinalSalary(row) - getDerivedBasicSalary(row)).toFixed(2)))
  }

  const getHra = (row) => {
    return getStoredOrCalculated(row, ['hra'], () => Number((getRemainingBalance(row) * 0.65).toFixed(2)))
  }

  const getTa = (row) => {
    return getStoredOrCalculated(row, ['ta'], () => Number((getRemainingBalance(row) * 0.25).toFixed(2)))
  }

  const getWashingAllowance = (row) => {
    return getStoredOrCalculated(row, ['washing_allowance', 'washingAllowance'], () => Number((getRemainingBalance(row) * 0.10).toFixed(2)))
  }
  const getReconciledGovernmentRow = (row) => {
    const sourcePresentDays = getPresentDays(row)
    const storedNet = sourcePresentDays <= 0
      ? 0
      : Number(row.saved_final_amount ?? row.net_amount ?? row.final_amount ?? 0)
    const storedTotalEarnings = Number(row.total_earnings ?? row.totalEarnings ?? 0)
    const storedTotalDeductions = Number(row.total_deductions ?? row.totalDeductions ?? 0)
    const storedPresentDays = getPresentDays(row)
    const storedAdditionalAbsentDays = Number(row.additional_absent_days ?? 0)
    const totalDays = Math.max(1, Number(row.total_days || 0))
    const baseSourceBasic = getSourceBasicSalary(row)
    const deductions = Number((
      getPf(row) +
      Number(row.pfvol || 0) +
      getEsi(row) +
      Number(row.tds || 0) +
      Number(row.advance_amount || 0) +
      Number(row.plwf || 0) +
      Number(row.professional_tax || 0)
    ).toFixed(2))

    let presentDays = Math.max(0, storedPresentDays)
    let extraAbsentDays = Math.max(0, storedAdditionalAbsentDays)

    const evaluate = (days) => {
      const finalSalary = Number(((baseSourceBasic * days) / totalDays).toFixed(2))
      const basicSalary = Number((finalSalary * 0.70).toFixed(2))
      const remainingBalance = Number((finalSalary - basicSalary).toFixed(2))
      const hra = Number((remainingBalance * 0.65).toFixed(2))
      const ta = Number((remainingBalance * 0.25).toFixed(2))
      const washingAllowance = Number((remainingBalance * 0.10).toFixed(2))
      const baseNet = Number((basicSalary + hra + ta + washingAllowance - deductions).toFixed(2))
      return { finalSalary, basicSalary, hra, ta, washingAllowance, baseNet }
    }

    let evaluated = evaluate(presentDays)
    const targetNet = Number.isFinite(storedNet) && storedNet > 0 ? storedNet : evaluated.baseNet

    while (presentDays > 0 && evaluated.baseNet > targetNet) {
      presentDays -= 1
      extraAbsentDays += 1
      evaluated = evaluate(presentDays)
    }

    const productionIncentiveStored = Number(row.production_incentives ?? row.productionIncentive ?? row.incentive ?? 0)
    const productionIncentives = productionIncentiveStored > 0
      ? productionIncentiveStored
      : Math.max(0, Number((targetNet - evaluated.baseNet).toFixed(2)))
    const totalEarnings = storedTotalEarnings > 0
      ? storedTotalEarnings
      : Number((evaluated.basicSalary + evaluated.hra + evaluated.ta + evaluated.washingAllowance + productionIncentives).toFixed(2))
    const totalDeductions = storedTotalDeductions > 0 ? storedTotalDeductions : deductions
    const netAmount = storedNet > 0 ? storedNet : Number((totalEarnings - totalDeductions).toFixed(2))

    return {
      presentDays,
      extraAbsentDays,
      productionIncentives,
      finalSalary: evaluated.finalSalary,
      basicSalary: evaluated.basicSalary,
      hra: evaluated.hra,
      ta: evaluated.ta,
      washingAllowance: evaluated.washingAllowance,
      totalEarnings,
      totalDeductions,
      netAmount,
    }
  }

  const getEsi = (row) => {
    const esiValue = String(row.esiValue ?? row.esi_value ?? '').trim().toLowerCase()
    if (!['yes', 'y', 'true', '1'].includes(esiValue)) return 0
    const stored = Number(row.esi ?? 0)
    if (stored > 0) {
      return stored
    }

    return Number((getDerivedBasicSalary(row) * 0.0075).toFixed(2))
  }

  const getDeductionComponents = (row) => Number((
    getPf(row) +
    Number(row.pfvol || 0) +
    getEsi(row) +
    Number(row.tds || 0) +
    Number(row.advance_amount || 0) +
    Number(row.plwf || 0) +
    Number(row.professional_tax || 0)
  ).toFixed(2))

  const getTotalEarnings = (row) => Number(getReconciledGovernmentRow(row).totalEarnings.toFixed(2))

  const getNetAmount = (row) => {
    if (getPresentDays(row) <= 0) return 0
    const storedNet = Number(row.saved_final_amount ?? row.net_amount ?? row.final_amount ?? 0)
    return Number.isFinite(storedNet) ? storedNet : Number((getTotalEarnings(row) - getDeductionComponents(row)).toFixed(2))
  }

  const getTotalDeductions = (row) => Number((getPf(row) + Number(row.pfvol || 0) + getEsi(row) + Number(row.tds || 0) + Number(row.advance_amount || 0) + Number(row.plwf || 0) + Number(row.professional_tax || 0)).toFixed(2))

  const downloadGovernmentSalary = () => {
    if (!rows.length) return
    const rounded = (value) => Math.round(Number(value || 0))
    const exportRows = rows.map((row) => ({
      'S.No': row.sno,
      'Employee ID': row.empId,
      'Employee Name': row.employeeName,
      "Father's Name": row.fatherName,
      Company: row.company || '',
      'Days (Present/Total)': `${rounded(row.present_days)} / ${rounded(row.total_days)}`,
      'Source Basic Salary': rounded(getSourceBasicSalary(row)),
      'Final Salary': rounded(getFinalSalary(row)),
      'Basic Salary': rounded(getDerivedBasicSalary(row)),
      HRA: rounded(getHra(row)),
      TA: rounded(getTa(row)),
      'Washing Allowance': rounded(getWashingAllowance(row)),
      'Production Incentives': rounded(getReconciledGovernmentRow(row).productionIncentives),
      'Total Earnings': rounded(getTotalEarnings(row)),
      PF: rounded(getPf(row)),
      PFVOL: rounded(row.pfvol),
      ESI: rounded(getEsi(row)),
      TDS: rounded(row.tds),
      Advance: rounded(row.advance_amount),
      PLWF: rounded(row.plwf),
      'PROF. TAX': rounded(row.professional_tax),
      'Total Deductions': rounded(getTotalDeductions(row)),
      'Net Amount': rounded(getNetAmount(row)),
      'Extra Absent Days': rounded(getReconciledGovernmentRow(row).extraAbsentDays),
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    applyExcelTableStyle(worksheet, Object.keys(exportRows[0] || {}).length, exportRows.length, {
      widths: [8, 12, 22, 18, 18, 14, 14, 14, 14, 12, 14, 12, 12, 14, 12, 12, 12, 12, 12, 12, 14, 14, 14, 14, 14, 14],
      headerFill: 'F6E4E1',
      headerFont: '173F73',
    })
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Government Salary')
    XLSX.writeFile(workbook, `Governmental Salary ${String(monthNumberMap[selectedMonth]).padStart(2, '0')}-${selectedYear}.xlsx`)
  }

  const downloadSaralSalary = () => {
    if (!rows.length) return
    const rounded = (value) => Number((Number(value || 0)).toFixed(2))
    const exportRows = rows.map((row) => {
      const reconciled = getReconciledGovernmentRow(row)
      const employeeMeta = employeeMetaById.get(String(row.employee_id)) || employeeMetaById.get(String(row.empId)) || {}
      const sourceBasicSalary = getSourceBasicSalary(row)
      const finalBasicSalary = Number((sourceBasicSalary * (reconciled.presentDays / Math.max(1, Number(row.total_days || 0)))).toFixed(2))
      return {
        'S.No': row.sno,
        'Employee ID': row.empId,
        'Employee Name': row.employeeName,
        "Father's Name": row.fatherName,
        Company: employeeMeta.company || row.company || '',
        Department: employeeMeta.department || row.department || '',
        'Total Days': rounded(row.total_days),
        'Present Days': rounded(reconciled.presentDays),
        'Source Basic Salary': rounded(sourceBasicSalary),
        'Final Basic Salary': rounded(finalBasicSalary),
        'Basic Salary': rounded(reconciled.basicSalary),
        HRA: rounded(reconciled.hra),
        TA: rounded(reconciled.ta),
        'Washing Allowance': rounded(reconciled.washingAllowance),
        'Production Incentives': rounded(reconciled.productionIncentives),
        'Total Earnings': rounded(reconciled.totalEarnings),
        PF: rounded(getPf(row)),
        PFVOL: rounded(row.pfvol),
        ESI: rounded(getEsi(row)),
        TDS: rounded(row.tds),
        Advance: rounded(row.advance_amount),
        'Other Deduction': 0,
        PLWF: rounded(row.plwf),
        'PROF. TAX': rounded(row.professional_tax),
        'Total Deductions': rounded(getTotalDeductions(row)),
        'Net Amount': rounded(getNetAmount(row)),
      }
    })
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    applyExcelTableStyle(worksheet, Object.keys(exportRows[0] || {}).length, exportRows.length, {
      widths: [8, 12, 22, 18, 18, 14, 14, 14, 12, 12, 12, 14, 14, 14, 14, 14, 12, 12, 12, 12, 12, 12, 14, 14],
      headerFill: 'F6E4E1',
      headerFont: '173F73',
    })
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Saral Salary')
    XLSX.writeFile(workbook, `Saral Salary ${String(monthNumberMap[selectedMonth]).padStart(2, '0')}-${selectedYear}.xlsx`)
  }

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  return (
    <div className="page-stack">
      <section className="welcome-card salary-card">
        <div>
          <p className="eyebrow">Government Salary</p>
          <h2>Finalized Government Salary Register</h2>
          <p>Records are created at salary finalization and are shown exactly as stored for the selected month.</p>
          <p className="demo-hint" style={{ marginTop: '8px' }}>
            Reconciled to Salary Breakups Final Amount. Production Incentives adjust the difference when required.
          </p>
        </div>
        {finalized ? <span className="status-badge finalized">Finalized Snapshot</span> : null}
      </section>

      <section className="toolbar-card">
        <div className="filters-row" style={{ alignItems: 'flex-end' }}>
          <div className="select-group">
            <label htmlFor="gov-month">Month</label>
            <select id="gov-month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              {months.map((month) => <option key={month} value={month}>{month}</option>)}
            </select>
          </div>
          <div className="select-group">
            <label htmlFor="gov-year">Year</label>
            <select id="gov-year" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
        </div>
      </section>

      {loading ? <p className="form-error">Loading finalized Government Salary records...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {!loading && !error && !finalized ? <p className="status-message">Salaries for {selectedMonth} {selectedYear} have not been finalized yet. Finalize them in Salary Breakups first.</p> : null}

      {finalized ? (
        <section className="table-card">
          <div className="section-header"><div><p className="eyebrow">Stored Records</p><h2>{selectedMonth} {selectedYear}</h2></div><div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}><button type="button" className="secondary-btn" onClick={downloadGovernmentSalary}>Download Excel</button><button type="button" className="secondary-btn" onClick={downloadSaralSalary}>Export for Saral [{String(monthNumberMap[selectedMonth]).padStart(2, '0')}]-{selectedYear}.xlsx</button></div></div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="sticky-col sticky-col-1">S.No</th><th className="sticky-col sticky-col-2">Employee ID</th><th className="sticky-col sticky-col-3">Employee Name</th><th>Father&apos;s Name</th><th>Company</th><th>Days (Present/Total)</th><th>Source Basic Salary</th><th>Final Salary</th><th>Basic Salary</th>
                  <th>HRA</th><th>TA</th><th>Washing Allowance</th><th>Production Incentives</th><th>Total Earnings</th>
                  <th>PF</th><th>PFVOL</th><th>ESI</th><th>TDS</th><th>Advance</th><th>PLWF</th><th>PROF. TAX</th><th>Total Deductions</th><th>Net Amount</th><th>Extra Absent Days</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr key={row.id}>
                    <td className="sticky-col sticky-col-1">{row.sno}</td><td className="sticky-col sticky-col-2">{row.empId}</td><td className="sticky-col sticky-col-3">{row.employeeName}</td><td>{row.fatherName}</td><td>{row.company || ''}</td><td>{Math.round(Number(row.present_days || 0))} / {Math.round(Number(row.total_days || 0))}</td><td>{money(getSourceBasicSalary(row))}</td><td>{money(getFinalSalary(row))}</td><td>{money(getDerivedBasicSalary(row))}</td>
                    <td>{money(getHra(row))}</td><td>{money(getTa(row))}</td><td>{money(getWashingAllowance(row))}</td><td>{money(getReconciledGovernmentRow(row).productionIncentives)}</td><td className="earnings-cell">{money(getTotalEarnings(row))}</td>
                    <td className="deductions-cell">{money(getPf(row))}</td><td className="deductions-cell">{money(row.pfvol)}</td><td className="deductions-cell">{money(getEsi(row))}</td><td className="deductions-cell">{money(row.tds)}</td><td className="deductions-cell">{money(row.advance_amount)}</td><td className="deductions-cell">{money(row.plwf)}</td><td className="deductions-cell">{money(row.professional_tax)}</td><td className="deductions-cell">{money(getTotalDeductions(row))}</td><td>{money(getNetAmount(row))}</td>
                    <td>{money(getReconciledGovernmentRow(row).extraAbsentDays)}</td></tr>
                ))}
                {!paginatedRows.length ? <tr><td colSpan="26" className="empty-state-cell">No Government Salary snapshot records are available for this finalized month.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="pagination-bar">
            <button type="button" className="secondary-btn" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>Previous</button>
            <span className="pagination-label">Page {currentPage} of {totalPages}</span>
            <button type="button" className="secondary-btn" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>Next</button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default DaysAndInterestsPage
