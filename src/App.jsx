import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import EmployeesPage from './pages/EmployeesPage'
import HRPage from './pages/HRPage'
import SalaryBreakupsPage from './pages/SalaryBreakupsPage'
import AdvancesPage from './pages/AdvancesPage'
import DaysAndInterestsPage from './pages/DaysAndInterestsPage'
import EmployeeAttendancePage from './pages/EmployeeAttendancePage'
import HrSummaryPage from './pages/HrSummaryPage'
import DirectSalaryCalculationPage from './pages/DirectSalaryCalculationPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import UsersPage from './pages/UsersPage'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/masters/employees" element={<EmployeesPage />} />
            <Route path="/hr" element={<HRPage />} />
            <Route path="/hr/salary-breakups" element={<SalaryBreakupsPage />} />
            <Route path="/hr/days-and-interests" element={<DaysAndInterestsPage />} />
            <Route path="/hr/employee-attendance" element={<EmployeeAttendancePage />} />
            <Route path="/hr/advances" element={<AdvancesPage />} />
            <Route path="/reports/hr-summary" element={<HrSummaryPage />} />
            <Route path="/reports/direct-salary-calculation" element={<DirectSalaryCalculationPage />} />
            <Route path="/settings/reset-password" element={<ResetPasswordPage />} />
            <Route path="/settings/users" element={<UsersPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
