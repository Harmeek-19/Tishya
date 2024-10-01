
const { pool } = require('../utils/db');
const { PERMISSIONS, ROLES } = require('../utils/roles');
const { generateTokens, verifyRefreshToken, comparePassword, hashPassword } = require('../utils/auth');
const { AuthenticationError, ForbiddenError, UserInputError } = require('apollo-server-express');
const { authenticatedResolver, authorizedResolver } = require('../utils/resolverMiddleware');
const { GraphQLEmail } = require('graphql-custom-types');
const { ensureNonNullFields } = require('../utils/resolverHelpers');

const formatPost = (post, authorUsername) => ({
  id: post.id,
  content: post.content,
  createdAt: post.created_at.toISOString(),
  author: { id: post.author_id, username: authorUsername },
  likesCount: post.likes_count
});

const resolvers = {
  Email: GraphQLEmail,
  Query: {
    getUser: authenticatedResolver(async (_, { id }, { user }) => {
      try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows[0];
      } catch (error) {
        console.error('Error fetching user:', error);
        throw new Error('Failed to fetch user');
      }
    }),
    getProject: authenticatedResolver(async (_, { id }) => {
      try {
        const result = await pool.query(`
          SELECT p.*, u.username as owner_username 
          FROM projects p 
          JOIN users u ON p.owner_id = u.id 
          WHERE p.id = $1
        `, [id]);
        if (result.rows.length === 0) return null;
        const project = result.rows[0];
        return {
          ...project,
          owner: { id: project.owner_id, username: project.owner_username }
        };
      } catch (error) {
        console.error('Error fetching project:', error);
        throw new Error('Failed to fetch project');
      }
    }),
    getInstitution: authenticatedResolver(async (_, { id }) => {
      try {
        const result = await pool.query('SELECT * FROM institutions WHERE id = $1', [id]);
        return result.rows[0];
      } catch (error) {
        console.error('Error fetching institution:', error);
        throw new Error('Failed to fetch institution');
      }
    }),
    getFeed: authenticatedResolver(async (_, { userId }, { user }) => {
      try {
        const result = await pool.query(`
          SELECT p.*, u.username as author_username 
          FROM posts p 
          JOIN users u ON p.author_id = u.id 
          WHERE p.author_id = $1 
          ORDER BY p.created_at DESC
        `, [userId]);
        return result.rows.map(post => formatPost(post, post.author_username));
      } catch (error) {
        console.error('Error fetching feed:', error);
        throw new Error('Failed to fetch feed');
      }
    }),
    getUserProjects: authenticatedResolver(async (_, { userId }, { user }) => {
      try {
        const result = await pool.query('SELECT * FROM projects WHERE owner_id = $1', [userId]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching user projects:', error);
        throw new Error('Failed to fetch user projects');
      }
    }),
    getUserInstitutions: authenticatedResolver(async (_, { userId }, { user }) => {
      try {
        const result = await pool.query(`
          SELECT i.* FROM institutions i
          JOIN user_institutions ui ON i.id = ui.institution_id
          WHERE ui.user_id = $1
        `, [userId]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching user institutions:', error);
        throw new Error('Failed to fetch user institutions');
      }
    
    }),
    getPostLikes: authenticatedResolver(async (_, { postId }, { pool }) => {
      const result = await pool.query(`
        SELECT u.id, u.username 
        FROM users u
        JOIN likes l ON u.id = l.user_id
        WHERE l.post_id = $1
      `, [postId]);
      return result.rows;
    }),
  },
  Mutation: {
    createUser: async (_, { username, email, password, role }) => {
      try {
        const existingUser = await pool.query(
          'SELECT * FROM users WHERE username = $1 OR email = $2',
          [username, email]
        );
    
        if (existingUser.rows.length > 0) {
          throw new Error('Username or email already exists');
        }
    
        const hashedPassword = await hashPassword(password);
        const result = await pool.query(
          'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
          [username, email, hashedPassword, role || 'USER']
        );
        return ensureNonNullFields(result.rows[0], ['id', 'username', 'email', 'role']);
      } catch (error) {
        console.error('Error creating user:', error);
        throw new Error(error.message || 'Failed to create user');
      }
    },
    login: async (_, { email, password }) => {
      const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (user.rows.length === 0) {
        throw new AuthenticationError('Invalid email or password');
      }

      const isValid = await comparePassword(password, user.rows[0].password);
      if (!isValid) {
        throw new AuthenticationError('Invalid email or password');
      }

      const { accessToken, refreshToken } = generateTokens(user.rows[0]);
      return { accessToken, refreshToken, user: user.rows[0] };
    },
    refreshToken: async (_, { refreshToken }) => {
      const payload = verifyRefreshToken(refreshToken);
      if (!payload) {
        throw new AuthenticationError('Invalid refresh token');
      }

      const user = await pool.query('SELECT * FROM users WHERE id = $1', [payload.id]);
      if (user.rows.length === 0 || user.rows[0].token_version !== payload.tokenVersion) {
        throw new AuthenticationError('Invalid refresh token');
      }

      const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.rows[0]);
      return { accessToken, refreshToken: newRefreshToken };
    },
    logout: authenticatedResolver(async (_, __, { user }) => {
      try {
        await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [user.id]);
        return true;
      } catch (error) {
        console.error('Error logging out:', error);
        throw new Error('Failed to logout');
      }
    }),
    updateUser: authenticatedResolver(async (_, { id, username, email, bio }, { user }) => {
      console.log('Attempting to update user:', id);
      console.log('Authenticated user:', user);
      if (!user) {
        console.log('No authenticated user found in context');
        throw new AuthenticationError('You must be logged in to update a user');
      }
      if (user.id !== parseInt(id)) {
        console.log('User ID mismatch:', user.id, 'vs', id);
        throw new ForbiddenError('You can only update your own profile');
      }
      try {
        // Fetch current user data
        const currentUserData = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (currentUserData.rows.length === 0) {
          console.log('No user found with ID:', id);
          throw new Error('User not found');
        }
        const currentUser = currentUserData.rows[0];
    
        // Prepare update fields
        const updateFields = [];
        const updateValues = [];
        let parameterIndex = 1;
    
        if (username !== undefined) {
          updateFields.push(`username = $${parameterIndex}`);
          updateValues.push(username);
          parameterIndex++;
        }
        if (email !== undefined) {
          updateFields.push(`email = $${parameterIndex}`);
          updateValues.push(email);
          parameterIndex++;
        }
        if (bio !== undefined) {
          updateFields.push(`bio = $${parameterIndex}`);
          updateValues.push(bio);
          parameterIndex++;
        }
    
        // If no fields to update, return current user data
        if (updateFields.length === 0) {
          return currentUser;
        }
    
        // Construct and execute update query
        const updateQuery = `
          UPDATE users 
          SET ${updateFields.join(', ')} 
          WHERE id = $${parameterIndex} 
          RETURNING *
        `;
        updateValues.push(id);
    
        const result = await pool.query(updateQuery, updateValues);
        console.log('User updated successfully:', result.rows[0]);
        return result.rows[0];
      } catch (error) {
        console.error('Error updating user:', error);
        throw new Error('Failed to update user: ' + error.message);
      }
    }),
    createProject: authorizedResolver(PERMISSIONS.CREATE_PROJECT, async (_, { name, description }, { user }) => {
      try {
        const result = await pool.query(
          'INSERT INTO projects (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *',
          [name, description, user.id]
        );
        const project = result.rows[0];
        const ownerResult = await pool.query('SELECT username FROM users WHERE id = $1', [user.id]);
        return {
          ...project,
          owner: { id: user.id, username: ownerResult.rows[0].username }
        };
      } catch (error) {
        console.error('Error creating project:', error);
        throw new Error('Failed to create project');
      }
    }),
    createPost: authenticatedResolver(async (_, { content }, { user }) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
    
        const userResult = await client.query(
          'SELECT id, username, email, role FROM users WHERE id = $1',
          [user.id]
        );
    
        if (userResult.rows.length === 0) {
          throw new Error('User not found');
        }
    
        const currentUser = userResult.rows[0];
    
        const postResult = await client.query(
          'INSERT INTO posts (content, author_id, likes_count) VALUES ($1, $2, $3) RETURNING *',
          [content, currentUser.id, 0]
        );
        const post = postResult.rows[0];
    
        await client.query('COMMIT');
    
        return ensureNonNullFields({
          id: post.id,
          content: post.content,
          createdAt: post.created_at.toISOString(),
          author: ensureNonNullFields({
            id: currentUser.id,
            username: currentUser.username,
            email: currentUser.email,
            role: currentUser.role
          }, ['id', 'username', 'email', 'role']),
          likesCount: 0
        }, ['id', 'content', 'createdAt', 'author', 'likesCount']);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating post:', error);
        throw new Error('Failed to create post: ' + error.message);
      } finally {
        client.release();
      }
    }),    
    addComment: authenticatedResolver(async (_, { postId, content }, { user }) => {
      try {
        console.log('Authenticated user:', user); // Log the user object from the context
    
        // Start a transaction
        await pool.query('BEGIN');
    
        // Insert the comment
        const commentResult = await pool.query(
          'INSERT INTO comments (content, author_id, post_id) VALUES ($1, $2, $3) RETURNING *',
          [content, user.id, postId]
        );
        const comment = commentResult.rows[0];
        console.log('Inserted comment:', comment); // Log the inserted comment
    
        // Fetch the user's username
        const userResult = await pool.query(
          'SELECT username FROM users WHERE id = $1',
          [user.id]
        );
        console.log('User query result:', userResult.rows); // Log the user query result
    
        if (userResult.rows.length === 0) {
          throw new Error('User not found');
        }
    
        const username = userResult.rows[0].username;
        console.log('Retrieved username:', username); // Log the retrieved username
    
        // Fetch the post details
        const postResult = await pool.query(
          'SELECT content FROM posts WHERE id = $1',
          [postId]
        );
    
        if (postResult.rows.length === 0) {
          throw new Error('Post not found');
        }
    
        const post = postResult.rows[0];
    
        // Commit the transaction
        await pool.query('COMMIT');
    
        const result = {
          id: comment.id,
          content: comment.content,
          createdAt: comment.created_at.toISOString(),
          author: { id: user.id, username: username },
          post: { id: postId, content: post.content }
        };
        console.log('Returning result:', result); // Log the final result
        return result;
      } catch (error) {
        // Rollback the transaction in case of error
        await pool.query('ROLLBACK');
        console.error('Error adding comment:', error);
        throw new Error('Failed to add comment: ' + error.message);
      }
    }),
    addConnection: authenticatedResolver(async (_, { userId }, { user }) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
    
        console.log('Authenticated user:', user);
    
        // Fetch the current user's details
        const currentUserResult = await client.query('SELECT id, username FROM users WHERE id = $1', [user.id]);
        console.log('Current user query result:', currentUserResult.rows);
    
        if (currentUserResult.rows.length === 0) {
          throw new Error(`Authenticated user with ID ${user.id} not found in database`);
        }
        const currentUser = currentUserResult.rows[0];
    
        console.log('Current user:', currentUser);
    
        // Check if the user to connect with exists
        const userToConnectWith = await client.query('SELECT id, username FROM users WHERE id = $1', [userId]);
        console.log('User to connect with query result:', userToConnectWith.rows);
    
        if (userToConnectWith.rows.length === 0) {
          throw new Error(`User to connect with (ID: ${userId}) not found`);
        }
    
        // Check if connection already exists
        const existingConnection = await client.query(
          'SELECT * FROM user_connections WHERE user_id = $1 AND connected_user_id = $2',
          [currentUser.id, userId]
        );
        
        if (existingConnection.rows.length === 0) {
          // Add connection if it doesn't exist
          await client.query(
            'INSERT INTO user_connections (user_id, connected_user_id) VALUES ($1, $2)',
            [currentUser.id, userId]
          );
        } else {
          console.log('Connection already exists, returning existing data');
        }
    
        // Get all connections for the current user
        const connectionsResult = await client.query(`
          SELECT u.id, u.username 
          FROM users u
          JOIN user_connections uc ON u.id = uc.connected_user_id
          WHERE uc.user_id = $1
        `, [currentUser.id]);
    
        console.log('Connections result:', connectionsResult.rows);
    
        await client.query('COMMIT');
    
        const result = {
          id: currentUser.id,
          username: currentUser.username,
          connections: connectionsResult.rows,
          newConnectionCreated: existingConnection.rows.length === 0
        };
    
        console.log('Returning result:', result);
    
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding connection:', error);
        throw new Error('Failed to add connection: ' + error.message);
      } finally {
        client.release();
      }
    }),
    createInstitution: authorizedResolver(PERMISSIONS.CREATE_INSTITUTION, async (_, { name, type }) => {
      try {
        const result = await pool.query(
          'INSERT INTO institutions (name, type) VALUES ($1, $2) RETURNING *',
          [name, type]
        );
        return result.rows[0];
      } catch (error) {
        console.error('Error creating institution:', error);
        throw new Error('Failed to create institution');
      }
    }),
    joinInstitution: authenticatedResolver(async (_, { institutionId }, { user }) => {
      try {
        await pool.query(
          'INSERT INTO user_institutions (user_id, institution_id) VALUES ($1, $2)',
          [user.id, institutionId]
        );
        const result = await pool.query('SELECT * FROM institutions WHERE id = $1', [institutionId]);
        return result.rows[0];
      } catch (error) {
        console.error('Error joining institution:', error);
        throw new Error('Failed to join institution');
      }
    }),
    promoteToAdmin: authorizedResolver(PERMISSIONS.PROMOTE_USER, async (_, { userId }, { user }) => {
      try {
        const result = await pool.query(
          'UPDATE users SET role = $1 WHERE id = $2 RETURNING *',
          [ROLES.ADMIN, userId]
        );
        if (result.rows.length === 0) {
          throw new Error('User not found');
        }
        return result.rows[0];
      } catch (error) {
        console.error('Error promoting user to admin:', error);
        throw new Error('Failed to promote user to admin');
      }
    }),
    resetSequences: async (_, __, { user }) => {
      if (user.role !== ROLES.ADMIN) {
        throw new ForbiddenError('Only admins can reset sequences');
      }
      try {
        await pool.query(`
          SELECT setval('users_id_seq', 1, false);
          SELECT setval('projects_id_seq', 1, false);
          SELECT setval('institutions_id_seq', 1, false);
          SELECT setval('posts_id_seq', 1, false);
          SELECT setval('comments_id_seq', 1, false);
        `);
        return true;
      } catch (error) {
        console.error('Error resetting sequences:', error);
        throw new Error('Failed to reset sequences');
      }
    },
    likePost: authenticatedResolver(async (_, { postId }, { user, pool }) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Check if the post exists
        const postResult = await client.query('SELECT * FROM posts WHERE id = $1', [postId]);
        if (postResult.rows.length === 0) {
          throw new UserInputError('Post not found');
        }
    
        // Check if the user has already liked the post
        const existingLike = await client.query(
          'SELECT * FROM likes WHERE user_id = $1 AND post_id = $2',
          [user.id, postId]
        );
        if (existingLike.rows.length > 0) {
          throw new UserInputError('You have already liked this post');
        }
    
        // Add the like
        await client.query(
          'INSERT INTO likes (user_id, post_id) VALUES ($1, $2)',
          [user.id, postId]
        );
    
        // Get the updated post
        const updatedPostResult = await client.query(`
          SELECT p.*, u.username as author_username 
          FROM posts p 
          JOIN users u ON p.author_id = u.id 
          WHERE p.id = $1
        `, [postId]);
        const updatedPost = updatedPostResult.rows[0];
    
        await client.query('COMMIT');
    
        return formatPost(updatedPost, updatedPost.author_username);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }),

    unlikePost: authenticatedResolver(async (_, { postId }, { user, pool }) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Check if the post exists
        const postResult = await client.query('SELECT * FROM posts WHERE id = $1', [postId]);
        if (postResult.rows.length === 0) {
          throw new UserInputError('Post not found');
        }

        // Check if the user has liked the post
        const existingLike = await client.query(
          'SELECT * FROM likes WHERE user_id = $1 AND post_id = $2',
          [user.id, postId]
        );
        if (existingLike.rows.length === 0) {
          throw new UserInputError('You have not liked this post');
        }

        // Remove the like
        await client.query(
          'DELETE FROM likes WHERE user_id = $1 AND post_id = $2',
          [user.id, postId]
        );

        // Get the updated post
        const updatedPostResult = await client.query(`
          SELECT p.*, u.username as author_username 
          FROM posts p 
          JOIN users u ON p.author_id = u.id 
          WHERE p.id = $1
        `, [postId]);
        const updatedPost = updatedPostResult.rows[0];

        await client.query('COMMIT');

        return formatPost(updatedPost, updatedPost.author_username);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }),
  },
  Post: {
    likes: async (post, _, { pool }) => {
      const result = await pool.query(`
        SELECT u.id, u.username 
        FROM users u
        JOIN likes l ON u.id = l.user_id
        WHERE l.post_id = $1
      `, [post.id]);
      return result.rows;
    },
  },
};

module.exports = { resolvers };