const fs = require('fs')
const path = require('path')
const db = require('../server/db')

const envPath = path.join(__dirname, '..', 'server', '.env')
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8')
  envText.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      return
    }
    const equalsIndex = trimmed.indexOf('=')
    if (equalsIndex === -1) {
      return
    }
    const key = trimmed.slice(0, equalsIndex).trim()
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^"|"$/g, '')
    if (key && !process.env[key]) {
      process.env[key] = value
    }
  })
}

async function main() {
  try {
    const month = 6
    const year = 2026
    const cutoff = '2026-06-24'

    const summary = await db.query(
      `SELECT e.id AS employee_id,
              e.emp_id,
              e.employee_name,
              COALESCE(
                SUM(
                  CASE
                    WHEN a.attendance_status = 'present' THEN 1
                    WHEN a.attendance_status = 'half-day' THEN 0.5
                    ELSE 0
                  END
                ),
                0
              ) AS present_days,
              COALESCE(SUM(a.overtime_hours), 0) AS overtime_hours,
              COUNT(a.*) AS attendance_rows
       FROM tbl_employees e
       LEFT JOIN tbl_employee_attendance a
         ON a.employee_id = e.id
        AND EXTRACT(MONTH FROM a.attendance_date) = $1
        AND EXTRACT(YEAR FROM a.attendance_date) = $2
        AND a.attendance_date <= $3::date
       GROUP BY e.id
       ORDER BY e.sno, e.id`,
      [month, year, cutoff],
    )

    const monthDays = Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => {
      const day = index + 1
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    })

    const saved = await db.query(
      `SELECT TO_CHAR(attendance_date, 'YYYY-MM-DD') AS attendance_date,
              COUNT(*)::int AS row_count
       FROM tbl_employee_attendance
       WHERE EXTRACT(MONTH FROM attendance_date) = $1
         AND EXTRACT(YEAR FROM attendance_date) = $2
       GROUP BY 1
       ORDER BY 1`,
      [month, year],
    )

    const savedSet = new Set(saved.rows.map((row) => row.attendance_date))
    const missing = monthDays.filter((date) => !savedSet.has(date))
    const firstRows = summary.rows.slice(0, 10).map((row) => ({
      employee_id: row.employee_id,
      emp_id: row.emp_id,
      employee_name: row.employee_name,
      present_days: Number(row.present_days),
      overtime_hours: Number(row.overtime_hours),
      attendance_rows: Number(row.attendance_rows),
    }))

    const rawCounts = await db.query(
      `SELECT COUNT(*)::int AS attendance_rows,
              COUNT(DISTINCT attendance_date)::int AS distinct_dates
       FROM tbl_employee_attendance
       WHERE EXTRACT(MONTH FROM attendance_date) = $1
         AND EXTRACT(YEAR FROM attendance_date) = $2`,
      [month, year],
    )

    console.log(JSON.stringify({
      cutoff,
      summaryPreview: firstRows,
      savedAttendanceDates: saved.rows,
      monthStatus: {
        totalDays: monthDays.length,
        savedCount: savedSet.size,
        missingCount: missing.length,
        firstMissing: missing.slice(0, 10),
      },
      rawCounts: rawCounts.rows[0],
    }, null, 2))
  } finally {
    await db.pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
