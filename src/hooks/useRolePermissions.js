import { useAuth } from '../context/AuthContext'

export function useRolePermissions() {
  const { user } = useAuth()
  const roleId = Number(user?.roleId)
  const departmentId = Number(user?.departmentId ?? user?.departmentid)
  const isRole1Dept2 = roleId === 1 && departmentId === 2
  const isReadOnlyRole = roleId === 14 && departmentId === 2
  const canEdit = isRole1Dept2

  return {
    user,
    roleId,
    departmentId,
    isRole1Dept2,
    isReadOnlyRole,
    canEdit,
    canManageUsers: isRole1Dept2 && String(user?.departmentName || '').trim().toLowerCase() === 'it',
  }
}
