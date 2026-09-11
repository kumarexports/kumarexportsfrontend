# KumarExports

KumarExports is a React + Vite dashboard app with a local Express backend and PostgreSQL connectivity.

## What this project contains

- **Frontend:** React 19, Vite, React Router DOM, `xlsx` for Excel previews and `xlsx-js-style` for styled export sheets.
- **Backend:** Express + Node, PostgreSQL via `pg`, auth with `bcryptjs` and `jsonwebtoken`.
- **Database:** `tbl_users`, `tbl_roles`, `tbl_departments`, normalized payroll tables, and reporting tables such as `tbl_persons`.
- **Auth flow:** login with email/password, JWT issuance, localStorage persistence.
- **Master upload:** employees are created from an uploaded Excel workbook and stored in the master tables with saved source columns for `MRATE`, `BASIC`, `PF`, `PFVOL`, `ESI`, `TDS`, and `PROF.TAX`.

## Current behavior

- The backend serves API routes from `server/index.js`.
- The frontend calls the backend using `VITE_API_URL` from the root `.env`.
- Protected routes are enforced in `src/components/ProtectedRoute.jsx`.
- The login page uses `src/context/AuthContext.jsx` to authenticate against `/api/login`.
- Role-based frontend permissions are centralized in `src/hooks/useRolePermissions.js`.
- Role 1 with department 2 keeps full read/write access.
- Role 14 with department 2 gets read-only access on operational pages, while password reset remains available.
- The master screen supports salary increments, active/inactive employee management, reactivation, search, department filtering, pagination, and an Imported/Active/Inactive data toggle.
- Reports now includes `HR Summary` and `Direct Salary Calculation`.
- HR Summary aggregates absent-day history, leave category totals, week-off leave, and downloadable leave-date details.
- Direct Salary Calculation imports a separate workbook into `tbl_persons`, then displays the saved database values, uploaded target net amount, and derived breakdown in the UI.

## Startup instructions

### 1. Backend

```powershell
Set-Location 'D:\Kumar Exports\server'
npm install
# copy server\.env.example to server\.env and add your local Postgres credentials
npm start
```

The backend default port is `4000`, but in your current setup it is running on `4002`.

### 2. Frontend

```powershell
Set-Location 'D:\Kumar Exports'
npm install
npm run dev
```

If `5173` is in use, Vite will choose the next available port (for example `5174`, `5175`, `5176`, `5177`).

## Required env values

In `D:\Kumar Exports\.env`:

```text
VITE_API_URL=http://localhost:4002
```

In `D:\Kumar Exports\server\.env`:

```text
PGHOST=localhost
PGPORT=5432
PGDATABASE=KumarExports
PGUSER=postgres
PGPASSWORD=your_password
PORT=4002
JWT_SECRET=your_jwt_secret
```

## Useful commands

```powershell
# start backend
Set-Location 'D:\Kumar Exports\server'
npm start

# start frontend
Set-Location 'D:\Kumar Exports'
npm run dev
```

## Notes

- The frontend will show `invalid credentials` if it is not pointing to the correct backend URL.
- The login route is `POST /api/login`; `GET /api/login` is invalid.
- If ports are already in use, Vite and Express may choose alternate ports, so verify the actual URLs in the terminal output.
- The dashboard now shows the last finalized month snapshot and attendance percentages.
- Employee distribution uses unique `empId` values before calculating department totals and percentages.
- The master upload stores the uploaded master row data directly in `tbl_employees` and splits the uploaded BASIC into salary components without a minimum salary validation.
- Imported master data is now read back from the database columns instead of relying only on the temporary file preview.
- Saturday attendance saves now generate the following Sunday attendance automatically.
- HR Summary exports styled Excel files with filters, column widths, and a `Week Off` label when an absent row has no leave category.
- Direct Salary Calculation expects imported columns for `EmpID`, `Employee Name`, `Father's Name`, `Department`, `Basic Salary`, `Present Days`, `Total Days`, `PF`, `PFVOL`, `ESI`, `TDS`, `Advance`, `PLWF`, `PROF. TAX`, and `Net Amount`.
- Direct Salary Calculation stores rows in `tbl_persons` and balances the on-screen `Net Amount` against the uploaded target using the OT Allowance / Incentive and extra-absence adjustment rules.
- Direct Salary page formula notes:
  - `Basic = source basic salary * (Present Days / Total Days)`
  - `HRA = 6.66666667% of Basic`
  - `Conveyance Allowance = 26.666666667% of Basic`
  - `ESI = 0.75% of Basic when the imported ESI value is non-zero`
  - `Total Earnings = Basic + HRA + Conveyance Allowance + OT Allowance + Incentives`
  - `Total Deductions = PF + PFVOL + ESI + TDS + Advance + PLWF + PROF. TAX + Other Deductions`
  - `Net Amount` is adjusted to match the uploaded target amount, preferring OT Allowance and Incentive for positive gaps and extra absent days for negative gaps
