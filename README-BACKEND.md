# KumarExports - Backend (local)

This backend provides API routes for the KumarExports app, including PostgreSQL connectivity and login.

## Setup

1. Change to the `server` folder:

```powershell
Set-Location 'D:\Kumar Exports\server'
```

2. Install dependencies:

```powershell
npm install
```

3. Copy `.env.example` to `.env` and edit your local credentials:

```powershell
copy .env.example .env
```

4. Start the server:

```powershell
npm start
```

If port `4000` is unavailable, set `PORT` in `server\.env` and restart the server.

## Separate deployment

Build the frontend from the project root with the backend's public URL configured at build time:

```powershell
$env:VITE_API_URL = 'https://api.example.com'
npm run build
```

Deploy the generated `dist` directory to the frontend host. Deploy the `server` directory separately, install its dependencies, and configure `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PORT`, `JWT_SECRET`, and `CORS_ORIGIN`. Set `CORS_ORIGIN` to the exact frontend origin, such as `https://hr.example.com`; multiple origins may be comma-separated.

## Current endpoints

- `GET /api/health` returns `{ ok: true }`
- `POST /api/login` authenticates email/password and returns `{ ok, token, user }`
- `POST /api/logout` accepts an authenticated session and returns success; the client clears its token
- `POST /api/settings/reset-password` verifies the current password and updates to a new one
- `GET /api/settings/users` lists users for the IT department Admin
- `POST /api/settings/users` adds a user for the IT department Admin
- `DELETE /api/settings/users/:id` deletes a user for the IT department Admin

All API routes other than health and login require the Bearer token returned by `/api/login`. Tokens expire after 40 minutes. Production deployments must set a strong `JWT_SECRET`; the development fallback is rejected when `NODE_ENV=production`.

## Settings users schema

The Users page uses the existing normalized role and department tables. The UI displays names from these tables rather than raw IDs.

```sql
CREATE TABLE IF NOT EXISTS public.tbl_departments (
  id SERIAL PRIMARY KEY,
  departmentname VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tbl_roles (
  id SERIAL PRIMARY KEY,
  rolename VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tbl_users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100) UNIQUE,
  password TEXT,
  roleid INTEGER REFERENCES public.tbl_roles(id),
  departmentid INTEGER REFERENCES public.tbl_departments(id)
);
```

Users are visible, addable, and deletable only for the IT department Admin. Existing users cannot be edited. Any authenticated user can change their own password after entering the current password and matching new password.

Employee imports upsert the employee master by `emp_id` and write the uploaded salary rows only to the filename-selected month/year. Imports do not truncate employees, monthly payroll, or attendance, so finalized historical months remain intact.

## Reports and additional salary tables

The backend now also exposes reporting support for:

- `GET /api/reports/hr-summary`
- `POST /api/reports/direct-salary/import`
- `GET /api/reports/direct-salary`

`tbl_persons` is the dedicated table for Direct Salary Calculation imports. It is separate from `tbl_employees` and stores the uploaded row plus the uploaded target `net_amount` used by the UI reconciliation logic.

```sql
CREATE TABLE IF NOT EXISTS tbl_persons (
  id SERIAL PRIMARY KEY,
  emp_id VARCHAR(50) NOT NULL UNIQUE,
  employee_name VARCHAR(150) NOT NULL,
  father_name VARCHAR(150) NOT NULL,
  department VARCHAR(100) NOT NULL,
  basic_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
  present_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  total_days INTEGER NOT NULL DEFAULT 0,
  pf NUMERIC(14,2) NOT NULL DEFAULT 0,
  pfvol NUMERIC(14,2) NOT NULL DEFAULT 0,
  esi NUMERIC(14,2) NOT NULL DEFAULT 0,
  tds NUMERIC(14,2) NOT NULL DEFAULT 0,
  advance NUMERIC(14,2) NOT NULL DEFAULT 0,
  plwf NUMERIC(14,2) NOT NULL DEFAULT 0,
  prof_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  import_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

Direct Salary Calculation formulas currently used by the backend and frontend:

- `Basic = source basic salary * (Present Days / Total Days)`, rounded to the nearest rupee
- `HRA = 6.66666667% of Basic`, rounded to the nearest rupee
- `Conveyance Allowance = 26.666666667% of Basic`, rounded to the nearest rupee
- `ESI = 0.75% of Basic when the imported ESI value is non-zero, otherwise 0`
- `Total Earnings = Basic + HRA + Conveyance Allowance + OT Allowance + Incentives`
- `Total Deductions = PF + PFVOL + ESI + TDS + Advance + PLWF + PROF. TAX + Other Deductions`
- `Net Amount` is reconciled in the UI against `tbl_persons.net_amount`
- Positive gaps are filled with `OT Allowance` first, then `Incentive`
- Negative gaps are reduced by stepping down `Present Days` / `Extra Days Absent`, then any remainder is handled by the same reconciliation flow

HR Summary aggregates attendance history from `tbl_employee_attendance`:

- Total Absent Days
- Leave without Prior Information
- Leave to be Encashed
- Leave by ESI
- Week off Leave = Total Absent Days - sum of the three leave categories above
- Downloaded leave-date sheets label blank absent leave rows as `Week Off`

## HR attendance tables

For the employee master and day-wise attendance screen, add these tables:

```sql
CREATE TABLE IF NOT EXISTS tbl_employees (
  id SERIAL PRIMARY KEY,
  sno INT NOT NULL,
  emp_id VARCHAR(50) NOT NULL UNIQUE,
  employee_name VARCHAR(150) NOT NULL,
  father_name VARCHAR(150) NOT NULL,
  department VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tbl_employee_attendance (
  id SERIAL PRIMARY KEY,
  monthly_employee_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  attendance_status VARCHAR(12) NOT NULL CHECK (attendance_status IN ('present', 'half-day', 'absent')),
  overtime_hours NUMERIC(6, 2) NOT NULL DEFAULT 0,
  leave_category VARCHAR(40),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT fk_attendance_monthly_employee
    FOREIGN KEY (monthly_employee_id)
    REFERENCES tbl_employee_monthly(id)
    ON DELETE CASCADE,
  CONSTRAINT uq_monthly_employee_day
    UNIQUE (monthly_employee_id, attendance_date)
);
```

For an existing database, add the leave category with:

```sql
ALTER TABLE tbl_employee_attendance
ADD COLUMN IF NOT EXISTS leave_category VARCHAR(40);

ALTER TABLE tbl_employee_attendance
ADD CONSTRAINT tbl_employee_attendance_leave_category_check
CHECK (leave_category IS NULL OR leave_category IN ('Without Prior Information', 'Leave to be Encashed', 'Leave by ESI'));
```

Useful queries:

```sql
-- Add employee
INSERT INTO tbl_employees (sno, emp_id, employee_name, father_name, department)
VALUES ($1, $2, $3, $4, $5);

-- Soft delete / lock employee row
UPDATE tbl_employees
SET is_active = FALSE, updated_at = now()
WHERE id = $1;

-- Reactivate employee
UPDATE tbl_employees
SET is_active = TRUE, updated_at = now()
WHERE id = $1;

-- Save or update a whole day for one employee
INSERT INTO tbl_employee_attendance (monthly_employee_id, attendance_date, attendance_status, overtime_hours)
VALUES ($1, $2, $3, $4)
ON CONFLICT (monthly_employee_id, attendance_date)
DO UPDATE SET
  attendance_status = EXCLUDED.attendance_status,
  overtime_hours = EXCLUDED.overtime_hours,
  updated_at = now();

-- Load one day for editing
SELECT e.id, e.sno, e.emp_id, e.employee_name, e.father_name, e.department, e.is_active,
       a.attendance_status, a.overtime_hours
FROM tbl_employees e
JOIN tbl_employee_monthly m
  ON m.employee_id = e.id
LEFT JOIN tbl_employee_attendance a
  ON a.monthly_employee_id = m.id
 AND a.attendance_date = $1
ORDER BY e.sno;

-- Cumulative totals up to a selected date
SELECT e.id, e.sno, e.emp_id, e.employee_name,
       COUNT(*) FILTER (WHERE a.attendance_status = 'present') +
       (COUNT(*) FILTER (WHERE a.attendance_status = 'half-day') * 0.5) AS days_present_till_date,
       COALESCE(SUM(a.overtime_hours), 0) AS overtime_hours_till_now
FROM tbl_employees e
JOIN tbl_employee_monthly m
  ON m.employee_id = e.id
LEFT JOIN tbl_employee_attendance a
  ON a.monthly_employee_id = m.id
 AND a.attendance_date <= $1
GROUP BY e.id, e.sno, e.emp_id, e.employee_name
ORDER BY e.sno;

-- Save monthly payroll into tbl_employee_monthly
INSERT INTO tbl_employee_monthly (
  employee_id, month, year, mrate, basic_salary, present_days, total_days,
  overtime_hours, calculated_salary, advance_amount, salary_data
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (employee_id, month, year)
DO UPDATE SET
  mrate = EXCLUDED.mrate,
  basic_salary = EXCLUDED.basic_salary,
  present_days = EXCLUDED.present_days,
  total_days = EXCLUDED.total_days,
  overtime_hours = EXCLUDED.overtime_hours,
  calculated_salary = EXCLUDED.calculated_salary,
  advance_amount = EXCLUDED.advance_amount,
  salary_data = EXCLUDED.salary_data,
  updated_at = now();

-- Save Direct Salary rows into tbl_persons
INSERT INTO tbl_persons (
  emp_id, employee_name, father_name, department, basic_salary, present_days, total_days,
  pf, pfvol, esi, tds, advance, plwf, prof_tax, net_amount, import_data
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
ON CONFLICT (emp_id)
DO UPDATE SET
  employee_name = EXCLUDED.employee_name,
  father_name = EXCLUDED.father_name,
  department = EXCLUDED.department,
  basic_salary = EXCLUDED.basic_salary,
  present_days = EXCLUDED.present_days,
  total_days = EXCLUDED.total_days,
  pf = EXCLUDED.pf,
  pfvol = EXCLUDED.pfvol,
  esi = EXCLUDED.esi,
  tds = EXCLUDED.tds,
  advance = EXCLUDED.advance,
  plwf = EXCLUDED.plwf,
  prof_tax = EXCLUDED.prof_tax,
  net_amount = EXCLUDED.net_amount,
  import_data = EXCLUDED.import_data,
  updated_at = now();

## Salary Breakups formulas

- `Total Days = the number of calendar days in the selected month and year`
- `Days Amount = MRate * (Present Days / Total Days)`
- `OT Amount = MRate * ((OT Hours / 8) / Total Days)`
- `Total Earnings = Days Amount + OT Amount`
- `PLWF = 5`
- `ESI = 0 when Basic Salary > 21,000; otherwise 0.75% of Days Amount`
- `Advance = advance_amount from the Advances page`
- `Total Deductions = PLWF + PF + Prof. Tax + Advance + PF + PF Vol + ESI + TDS`
- `Final Amount = Total Earnings - Total Deductions`
```

## Authentication

The backend uses:

- `bcryptjs` to compare password hashes from `tbl_users`
- `jsonwebtoken` to sign a JWT on successful login

The login route checks `tbl_users` and joins the department table to return the department name:

```sql
SELECT u.id, u.name, u.email, u.password, u.roleid, u.departmentid,
       d.departmentname
FROM tbl_users u
LEFT JOIN tbl_departments d ON d.id = u.departmentid
WHERE u.email = $1
LIMIT 1;
```

## Database schema

A migration file exists at `server/migrations/init.sql` and includes:

- `tbl_departments`
- `tbl_roles`
- `tbl_users`
- `tbl_employee_monthly` (stores month-wise payroll values per employee)
- `tbl_employee_attendance` references `tbl_employee_monthly` and supports `half-day`
- `tbl_finalized_salary_records` stores the permanent employee/month finalization snapshot (`employee_id`, `month`, `year`, `present_days`, `final_amount`)
- `tbl_government_salary_records` stores the permanent Government Salary register generated at finalization

`tbl_employee_monthly` is month-wise. It stores each employee record under the unique `(employee_id, month, year)` key, and advances are saved against that same month/year record.

For an existing database that does not yet contain the columns, run this idempotent migration:

```sql
CREATE TABLE public.tbl_employee_monthly (...);
ALTER TABLE tbl_employee_attendance ADD COLUMN IF NOT EXISTS monthly_employee_id INT;
ALTER TABLE tbl_employee_attendance
  ADD CONSTRAINT fk_attendance_monthly_employee
  FOREIGN KEY (monthly_employee_id) REFERENCES tbl_employee_monthly(id) ON DELETE CASCADE;
```

The API uses the selected period on every Salary Breakups and Advances request:

```text
GET  /api/salary-breakups?month=6&year=2026
POST /api/salary-breakups/upsert     { month, year, rows }
POST /api/salary-breakups/advance    { employeeId, month, year, addAdvanceAmount }
```

## Government Salary workflow

`server/migrations/20260724_government_salary.sql` creates the two Government Salary snapshot tables. The backend also applies the same idempotent schema creation during startup.

- Salary finalization is transactional. It first verifies every calendar date in the month has saved attendance.
- For each active employee, finalization stores the actual monthly Present Days and Final Amount in `tbl_finalized_salary_records`.
- Finalization takes `Basic Salary`, `PF`, `PFVOL`, `Professional Tax`, `TDS`, and `Advance` only from that employee's Salary Breakups row for the exact selected month and year.
- Finalization is blocked unless every active employee has a Salary Breakups record for the selected month and year. For example: `Upload/import Salary Breakups for June 2026 first.` No later month's workbook data is used as a fallback.
- The same transaction deletes and replaces that month’s `tbl_government_salary_records`, allowing a re-finalization to safely regenerate the snapshot.
- The Governmental Salary page reads only these stored rows. It never recalculates a finalized month in the browser.
- Government Salary formulas:
  - `Updated Basic Salary = Basic Salary * (Present Days / Total Days)`
  - `HRA = 6.667% of Updated Basic Salary`
  - `Conveyance = 26.667% of Updated Basic Salary`
  - `Total Earnings = Updated Basic Salary + HRA + Conveyance + OT Allowance + Incentive`
  - `Total Deductions = PF + PFVOL + ESI + TDS + Advance + Other Deduction + PLWF + OTHER DEDUCTIONS + PROF. TAX`
  - `Net Amount = Total Earnings - Total Deductions`
- Reconciliation guarantees `Net Amount = saved Final Amount` to the paise. A positive difference is split between OT Allowance (30%) and Incentive (70%). A negative difference first applies additional whole absent days, then records any remainder as `Other Deduction`.

## Frontend notes

- Salary Breakups includes a `Click here to download the previous file` action that downloads the last imported workbook in the current session.
- Salary Breakups expects the uploaded workbook to match the `Book1.xlsx` style header set, with the key columns for `S.no.`, `Emp ID`, `Name`, `Father's Name`, `Department`, `MRATE`, `BASIC`, `PF`, `PFVOL`, `ESI`, `TDS`, and `PROF.TAX`.
- Salary Breakups renders a frozen first block of columns for `S.no.`, `Emp ID`, and `Employee Name`, while the earnings columns are highlighted green and the deduction columns are highlighted red.
- Salary Breakups calculates `Days Amount`, `OT Amount`, `Total Earnings`, `Total Deductions`, and `Final Amount` live from the imported workbook plus the selected month and year.
- Salary Breakups sends the selected month’s final calendar date when loading its attendance summary, so Present Days and OT Hours always represent the complete selected month.
- Salary finalization requires every date in the selected month to have attendance saved first.
- Finalized months lock Attendance, Advances, and Salary Breakups edits for that month.
- March 2026 is intentionally blocked from finalization.
- The month finalization dialog now lists missing attendance dates, or shows a confirm step when the month is complete.
- Attendance uses `Present`, `Half Day`, and `Absent`.
- `Half Day` counts as `0.5` present for salary calculations.
- Employee Attendance imports can also populate the salary breakup data for the same employees.
- `Settings > Reset your password` updates the stored password after validating the current password and matching the new password fields.
- Pagination on the HR tables keeps `Previous` on the left, `Page X of Y` centered, and `Next` on the right.
- Governmental Salary is a read-only finalization snapshot. Selecting a month before it is finalized shows the finalization status rather than calculated values.

## Known working auth credentials

- `admin@kumarexports.com` / `admin123`
- `ssood@kumarexports.com` / `Ok$51`
- `sakshamnagpal1930@gmail.com` / `Ok$51`

## Troubleshooting

- Make sure the frontend sets `VITE_API_URL` to the backend URL.
- The frontend must call `POST /api/login`, not `GET /api/login`.
- If you see `invalid credentials`, verify the backend port and the `.env` `VITE_API_URL` value.
