const employees = [
  { name: 'Nisha Rao', designation: 'Operations Manager', department: 'Logistics', status: 'Active' },
  { name: 'Devansh Mehta', designation: 'Sales Executive', department: 'Exports', status: 'Active' },
  { name: 'Ritika Sen', designation: 'Compliance Lead', department: 'Documentation', status: 'On Leave' },
]

function HRPage() {
  return (
    <div className="page-stack">
      <section className="section-header">
        <div>
          <p className="eyebrow">HR Management</p>
          <h2>Employee Directory</h2>
        </div>
        <button type="button" className="primary-btn">
          Add Employee
        </button>
      </section>

      <section className="table-card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Designation</th>
              <th>Department</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.name}>
                <td>{employee.name}</td>
                <td>{employee.designation}</td>
                <td>{employee.department}</td>
                <td>
                  <span className={`status-pill ${employee.status.toLowerCase().replace(/\s+/g, '-')}`}>
                    {employee.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default HRPage
