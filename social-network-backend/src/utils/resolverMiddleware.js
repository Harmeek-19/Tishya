const { AuthenticationError, ForbiddenError } = require('apollo-server-express');
const { hasPermission } = require('./roles');

const authenticatedResolver = (resolver) => {
  return (parent, args, context, info) => {
    console.log('Context in authenticatedResolver:', context); // Log the entire context
    if (!context.user || !context.user.id) {
      throw new AuthenticationError('You must be logged in to perform this action');
    }
    console.log('Authenticated user:', context.user); // Log the user object
    return resolver(parent, args, context, info);
  };
};

const authorizedResolver = (permission, resolver) => {
  return authenticatedResolver((parent, args, context, info) => {
    console.log('User:', context.user);
    console.log('Required permission:', permission);
    console.log('User role:', context.user.role);
    if (!hasPermission(context.user.role, permission)) {
      throw new ForbiddenError('You do not have permission to perform this action');
    }
    return resolver(parent, args, context, info);
  });
};

module.exports = { authenticatedResolver, authorizedResolver };