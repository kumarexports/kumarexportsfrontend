import { useEffect, useMemo, useState } from 'react'
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

function DashboardPage() {
  const [employees, setEmployees] = useState([])
  const [attendanceSummary, setAttendanceSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [swal, setSwal] = useState({ open: false, title: '', text: '', kind: 'error' })

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true)
        const [{ response, data }, attendanceResult] = await Promise.all([
          fetchJson(`${API_URL}/api/hr/employees`),
          fetchJson(`${API_URL}/api/dashboard/finalized-attendance`),
        ])
        if (!response.ok || !data.ok || !attendanceResult.response.ok || !attendanceResult.data.ok) {
          throw new Error(data.error || 'Unable to load employee data.')
        }

        setEmployees(data.employees || [])
        setAttendanceSummary(attendanceResult.data)
      } catch (err) {
        const message = err.message || 'Unable to load dashboard data.'
        setSwal({ open: true, title: 'Dashboard Error', text: message, kind: 'error' })
      } finally {
        setLoading(false)
      }
    }

    void loadDashboard()
  }, [])

  const departmentBreakdown = useMemo(() => {
    const uniqueEmployees = Array.from(
      new Map(
        employees
          .map((employee) => [String(employee.empId || employee.id || '').trim(), employee])
          .filter(([key]) => key),
      ).values(),
    )

    const counts = uniqueEmployees.reduce((acc, employee) => {
      const department = String(employee.department || 'Unassigned').trim() || 'Unassigned'
      acc[department] = (acc[department] || 0) + 1
      return acc
    }, {})

    const total = uniqueEmployees.length || 1
    const palette = ['#1e56a0', '#4b89dc', '#7fb4ff', '#173f73', '#8fcef7', '#2c7be5']
    let start = 0

    return Object.entries(counts).map(([department, count], index) => {
      const share = count / total
      const end = start + share * 360
      const segment = {
        department,
        count,
        color: palette[index % palette.length],
        start,
        end,
        percentage: Number((share * 100).toFixed(1)),
      }
      start = end
      return segment
    })
  }, [employees])

  const companyBreakdown = useMemo(() => {
    const uniqueEmployees = Array.from(
      new Map(
        employees
          .map((employee) => [String(employee.empId || employee.id || '').trim(), employee])
          .filter(([key]) => key),
      ).values(),
    )

    const counts = uniqueEmployees.reduce((acc, employee) => {
      const company = String(employee.company || 'Unassigned').trim() || 'Unassigned'
      acc[company] = (acc[company] || 0) + 1
      return acc
    }, {})

    const total = uniqueEmployees.length || 1
    const palette = ['#0f766e', '#14b8a6', '#2dd4bf', '#0ea5e9', '#38bdf8', '#155e75']
    let start = 0

    return Object.entries(counts).map(([company, count], index) => {
      const share = count / total
      const end = start + share * 360
      const segment = {
        company,
        count,
        color: palette[index % palette.length],
        start,
        end,
        percentage: Number((share * 100).toFixed(1)),
      }
      start = end
      return segment
    })
  }, [employees])

  const companyPieGradient = useMemo(() => {
    if (!companyBreakdown.length) {
      return 'conic-gradient(#dce7f4 0deg 360deg)'
    }

    return `conic-gradient(${companyBreakdown
      .map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`)
      .join(', ')})`
  }, [companyBreakdown])

  const pieGradient = useMemo(() => {
    if (!departmentBreakdown.length) {
      return 'conic-gradient(#dce7f4 0deg 360deg)'
    }

    return `conic-gradient(${departmentBreakdown
      .map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`)
      .join(', ')})`
  }, [departmentBreakdown])

  const finalizedLabel = attendanceSummary?.finalizedMonth
    ? new Date(attendanceSummary.finalizedMonth.year, attendanceSummary.finalizedMonth.month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : null
  const status = attendanceSummary?.summary?.status || { present: 0, absent: 0 }
  const overtime = attendanceSummary?.summary?.overtime || { total_overtime: 0, overtime_entries: 0, average_overtime: 0 }
  const payroll = attendanceSummary?.summary || {}
  const totalFinalizedAttendance = Number(status.present || 0) + Number(status.absent || 0)
  const presentRate = totalFinalizedAttendance ? (Number(status.present || 0) / totalFinalizedAttendance) * 100 : 0
  const absentRate = totalFinalizedAttendance ? (Number(status.absent || 0) / totalFinalizedAttendance) * 100 : 0

  return (
    <div className="page-stack">
      <section className="welcome-card">
        <div>
          <p className="eyebrow">Operations Overview</p>
          <h2>Welcome to Kumar Exports</h2>
          <p>Track your HR updates and daily priorities from one place.</p>
        </div>
        <div className="pill">Live status: Stable</div>
      </section>

      <section className="table-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Department Split</p>
            <h2>Employee Distribution</h2>
          </div>
        </div>

        <div className="dashboard-distribution-grid">
          <article className="summary-card distribution-panel">
            <p className="eyebrow">Department Split</p>
            <div className="department-chart">
              <div className="pie-chart" style={{ background: pieGradient }} aria-label="Department split pie chart" />
              <div className="department-legend">
                {departmentBreakdown.length > 0 ? (
                  departmentBreakdown.map((segment) => (
                    <div className="legend-item" key={segment.department}>
                      <span className="legend-swatch" style={{ background: segment.color }} />
                      <div>
                        <strong>{segment.department}</strong>
                        <p>
                          {segment.count} employee{segment.count === 1 ? '' : 's'} Â· {segment.percentage}%
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="card-note">No employee data available yet.</p>
                )}
              </div>
            </div>
          </article>

          <article className="summary-card distribution-panel">
            <p className="eyebrow">Company Split</p>
            <div className="department-chart">
              <div className="pie-chart" style={{ background: companyPieGradient }} aria-label="Company split pie chart" />
              <div className="department-legend">
                {companyBreakdown.length > 0 ? (
                  companyBreakdown.map((segment) => (
                    <div className="legend-item" key={segment.company}>
                      <span className="legend-swatch" style={{ background: segment.color }} />
                      <div>
                        <strong>{segment.company}</strong>
                        <p>
                          {segment.count} employee{segment.count === 1 ? '' : 's'} Â· {segment.percentage}%
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="card-note">No company data available yet.</p>
                )}
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="card-grid">
        <article className="summary-card">
          <p className="card-title">Last Finalized Month</p>
          <h3>{loading ? '...' : finalizedLabel || 'No finalized month yet'}</h3>
          <p className="card-note">
            {loading ? 'Loading snapshot...' : finalizedLabel ? 'Stored Snapshot' : 'Finalize a salary month to see the snapshot.'}
          </p>
        </article>
        <article className="summary-card">
          <p className="card-title">Finalized Employees</p>
          <h3>{loading ? '...' : Number(payroll.finalizedEmployees || 0)}</h3>
          <p className="card-note">Employees included in the latest locked month</p>
        </article>
        <article className="summary-card">
          <p className="card-title">Average Attendance</p>
          <h3>{loading ? '...' : `${presentRate.toFixed(2)}%`}</h3>
          <p className="card-note">
            Present {presentRate.toFixed(2)}% Â· Absent {absentRate.toFixed(2)}%
          </p>
        </article>
        <article className="summary-card">
          <p className="card-title">Payroll Total</p>
          <h3>{loading ? '...' : Number(payroll.totalFinalAmount || 0).toFixed(0)}</h3>
          <p className="card-note">Total finalized amount for the latest locked month</p>
        </article>
        <article className="summary-card">
          <p className="card-title">Average Final Amount</p>
          <h3>{loading ? '...' : Number(payroll.averageFinalAmount || 0).toFixed(0)}</h3>
          <p className="card-note">Average finalized amount per employee</p>
        </article>
        <article className="summary-card">
          <p className="card-title">Max Final Amount</p>
          <h3>{loading ? '...' : Number(payroll.maxFinalAmount || 0).toFixed(0)}</h3>
          <p className="card-note">Highest finalized amount in the locked month</p>
        </article>
      </section>

      <section className="table-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Last Finalized Month</p>
            <h2>{finalizedLabel || 'No finalized month yet'}</h2>
          </div>
          {finalizedLabel ? <span className="status-badge finalized">Stored Snapshot</span> : null}
        </div>
        {finalizedLabel ? (
          <div className="card-grid dashboard-attendance-grid">
            <article className="summary-card">
              <p className="card-title">Average Attendance</p>
              <h3>{loading ? '...' : `${presentRate.toFixed(2)}%`}</h3>
              <p className="card-note">
                Present {presentRate.toFixed(2)}% Â· Absent {absentRate.toFixed(2)}%
              </p>
            </article>
            <article className="summary-card">
              <p className="card-title">Total Overtime</p>
              <h3>{Number(overtime.total_overtime || 0).toFixed(2)} hrs</h3>
              <p className="card-note">{overtime.overtime_entries} overtime entries</p>
            </article>
            <article className="summary-card">
              <p className="card-title">Average Overtime</p>
              <h3>{Number(overtime.average_overtime || 0).toFixed(2)} hrs</h3>
              <p className="card-note">Per overtime entry</p>
            </article>
          </div>
        ) : <p className="card-note">Finalize a salary month to see attendance and overtime statistics here.</p>}
      </section>

      {finalizedLabel ? <section className="table-card">
        <div className="section-header"><div><p className="eyebrow">Overtime Split</p><h2>Overtime by Department</h2></div></div>
        <div className="table-scroll"><table><thead><tr><th>Department</th><th>Present</th><th>Absent</th><th>Overtime Hours</th></tr></thead><tbody>
          {(attendanceSummary?.summary?.departments || []).map((department) => <tr key={department.department}><td>{department.department || 'Unassigned'}</td><td>{department.present || department.present_count || 0}</td><td>{department.absent || department.absent_count || 0}</td><td>{Number(department.overtime_hours || 0).toFixed(2)}</td></tr>)}
        </tbody></table></div>
        <p className="eyebrow" style={{ marginTop: '22px' }}>Top Overtime Employees</p>
        <div className="table-scroll"><table><thead><tr><th>Employee ID</th><th>Employee Name</th><th>Department</th><th>Overtime Hours</th></tr></thead><tbody>
          {(attendanceSummary?.summary?.topEmployees || []).map((employee) => <tr key={employee.empId}><td>{employee.empId}</td><td>{employee.employeeName}</td><td>{employee.department}</td><td>{Number(employee.overtime_hours || 0).toFixed(2)}</td></tr>)}
        </tbody></table></div>
      </section> : null}

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

export default DashboardPage

