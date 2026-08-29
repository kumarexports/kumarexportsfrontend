# KumarExports Project Guide

## Purpose
KumarExports is a React + Vite dashboard-style web application for an export/trading company. The app includes:
- a login screen with mock authentication
- a protected dashboard shell
- a Masters section for employee payroll master uploads and salary management
- an HR section with nested salary-related pages
- Excel upload support for salary breakup data

## Tech Stack
- React 19
- React Router DOM
- Vite
- xlsx for parsing Excel workbooks
- CSS in App.css and index.css

## Project Structure
- src/App.jsx: application routes and top-level providers
- src/components/Layout.jsx: sidebar, header, and nested navigation UI
- src/components/ProtectedRoute.jsx: guards routes behind authentication
- src/context/AuthContext.jsx: mock auth provider and session storage logic
- src/pages/
  - LoginPage.jsx: login form and validation
  - DashboardPage.jsx: welcome/dashboard summary content
  - EmployeesPage.jsx: master upload, increments, employee status management, and imported/active/inactive record views
  - SalaryCategoriesPage.jsx: salary category placeholder page
  - HRPage.jsx: basic HR directory view
  - SalaryBreakupsPage.jsx: Excel upload and preview of salary breakup data
  - DaysAndInterestsPage.jsx: placeholder page for days/interests calculation

## Authentication Flow
1. The app wraps everything in AuthProvider from src/context/AuthContext.jsx.
2. LoginPage uses the login() function from the auth context.
3. Credentials are managed in the backend `tbl_users` table.
4. The auth state is persisted in localStorage under the key kumarexports-auth-user.
5. ProtectedRoute redirects unauthenticated users back to the login page.
6. Role-based UI permissions are centralized in `src/hooks/useRolePermissions.js`.
7. Role 1 with department 2 keeps full read/write access.
8. Role 14 with department 2 gets read-only access for operational pages, but password reset remains available.
9. Masters employee uploads now create payroll master data, split BASIC into salary components, preserve deduction rules, and store the uploaded source columns directly in `tbl_employees`.
10. Direct Salary Calculation imports into `tbl_persons` and reconciles the displayed net amount against the uploaded target using OT Allowance, Incentive, and extra-absence adjustment rules.

## Routing Model
- / -> LoginPage
- /dashboard -> DashboardPage (protected)
- /masters/employees -> EmployeesPage (protected)
- /masters/salary-categories -> SalaryCategoriesPage (protected)
- /hr -> HRPage (protected)
- /hr/salary-breakups -> SalaryBreakupsPage (protected)
- /hr/days-and-interests -> DaysAndInterestsPage (protected)

## Sidebar Navigation
The layout uses a responsive sidebar and top header.
- Dashboard
- Masters
  - Employees
  - Salary Categories
- HR
  - Salary Breakups
  - Days and Interests Calculation
- Settings
  - Reset your password
  - Users

## Role-Based Access
- Read-only mode is applied in the frontend for users with `roleId === 14` and `departmentId === 2`.
- In read-only mode, action buttons for import, save, finalize, download, add, delete, and similar write actions are hidden or disabled.
- Navigation, logout, and viewing/pagination controls remain available.
- Password reset is available to authenticated users and is not blocked by the read-only role.
- The Employees master page supports Imported/Active/Inactive switching, active/inactive filtering, reactivation, salary increment history capture, search, department filtering, and pagination.

## Excel Upload Behavior
The SalaryBreakupsPage uses xlsx to read workbook data.
- It looks for a sheet whose name includes salary or export; otherwise it uses the first sheet.
- It reads the workbook with formula-aware parsing using raw: false and cellFormula: true.
- The page renders the workbook as a spreadsheet-style table.
- It also attempts to load a sample workbook from the public folder at /KACL MAY-2026 FINAL.xlsx.
- The Masters employee upload expects `S.No.`, `Emp ID`, `Name`, `Father's Name`, `Department`, `MRATE`, `BASIC`, `PF`, `PFVOL`, `ESI`, `TDS`, and `PROF.TAX`.
- Uploaded rows are stored in `tbl_employees` as individual columns for master viewing, and the Imported tab reads those saved columns back from the database.
- Uploaded `BASIC` is split into salary components and validated so the derived basic salary never falls below ₹15,075.
- Direct Salary Calculation uses the imported workbook target net amount as the reconciliation target, not the already stored display net alone.
- The report prefers OT Allowance and Incentive to fill positive gaps; if the calculated amount is too high, it reduces Present Days / Extra Days Absent first.

## Dashboard Snapshot
- The dashboard summary now surfaces the last finalized month snapshot.
- Employee distribution counts are deduped by unique `empId` before department percentages are calculated.
- Saturday attendance saves automatically create the following Sunday attendance and mark it absent if the employee had 3 or more absences in the Monday-Saturday window.

## Styling Notes
- The UI uses a white-and-blue corporate theme.
- Most visual styling is centralized in src/App.css.
- Global reset/base styles live in src/index.css.

## Development Commands
Run locally:
- npm install
- npm run dev

Build for production:
- npm run build

## Important Implementation Notes for Future Agents
- Keep the auth flow centralized in src/context/AuthContext.jsx.
- Add new protected routes through the existing route structure in src/App.jsx.
- If adding new sidebar items, update both Layout.jsx and the route definitions.
- The salary upload feature is currently a UI preview layer; if you need real payroll calculation logic later, implement it in SalaryBreakupsPage.jsx or a dedicated service module.
- If a new page is added under HR, update the nested submenu in Layout.jsx.

## Suggested Extension Points
- Replace mock auth with a real backend API
- Add forms for employee management and salary entries
- Store uploaded Excel data in a backend or state store
- Add export/download actions for salary summaries
