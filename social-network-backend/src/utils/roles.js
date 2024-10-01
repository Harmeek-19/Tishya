const ROLES = {
    ADMIN: 'admin',
    USER: 'user',
  };
  
  const PERMISSIONS = {
    CREATE_PROJECT: 'create:project',
    DELETE_PROJECT: 'delete:project',
    CREATE_INSTITUTION: 'create:institution',
    PROMOTE_USER: 'promote:user',
  };
  
  const rolePermissions = {
    [ROLES.ADMIN]: [PERMISSIONS.CREATE_PROJECT, PERMISSIONS.DELETE_PROJECT, PERMISSIONS.CREATE_INSTITUTION, PERMISSIONS.PROMOTE_USER],
    [ROLES.USER]: [PERMISSIONS.CREATE_PROJECT],
  };
  
  const hasPermission = (userRole, permission) => {
    return rolePermissions[userRole]?.includes(permission) || false;
  };
  
  module.exports = {
    ROLES,
    PERMISSIONS,
    hasPermission,
  };