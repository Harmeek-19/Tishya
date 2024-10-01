const { verifyToken } = require('../utils/auth');

const authMiddleware = async (req) => {
  const token = req.headers.authorization || '';
  if (!token) return { user: null };

  try {
    const decoded = verifyToken(token.replace('Bearer ', ''));
    if (decoded) {
      // Here, you would typically fetch the user from the database
      // For now, we'll just return the decoded user info
      return { user: decoded };
    }
  } catch (err) {
    console.error('Error verifying token:', err);
  }

  return { user: null };
};

module.exports = authMiddleware;