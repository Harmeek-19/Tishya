require('dotenv').config({ path: __dirname + '/.env' });
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? 'SET' : 'NOT SET');
console.log('DB_PORT:', process.env.DB_PORT);

process.env.TZ = 'UTC';  // or your local timezone like 'America/New_York'
const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const { typeDefs } = require('./schema');
const { resolvers } = require('./resolvers');
const { connectDB } = require('./utils/db');
const { verifyAccessToken } = require('./utils/auth');
const morgan = require('morgan');
const winston = require('winston');
const { pool } = require('./utils/db');
const { runMigrations } = require('./utils/runMigrations');

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

async function startServer() {
  const app = express();

  // Use Morgan for HTTP request logging
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

  try {
    await connectDB();
    logger.info('Connected to PostgreSQL database');

    await runMigrations();
    logger.info('Migrations completed successfully');

    const server = new ApolloServer({
      typeDefs,
      resolvers,
      context: ({ req }) => {
        const token = req.headers.authorization || '';
        console.log('Received token:', token);
        if (token) {
          const user = verifyAccessToken(token.replace('Bearer ', ''));
          console.log('Verified user:', user);
          return { user, pool };
        }
        return { user: null, pool };
      },
      introspection: true,
      playground: true,
      formatError: (error) => {
        console.error('GraphQL Error:', error);
        logger.error('GraphQL Error', { 
          message: error.message,
          path: error.path,
          locations: error.locations,
          stack: error.extensions?.exception?.stacktrace
        });
        return {
          message: error.message,
          locations: error.locations,
          path: error.path,
        };
      },
      plugins: [
        {
          requestDidStart: async () => ({
            didEncounterErrors: async ({ errors }) => {
              errors.forEach((error) => {
                console.error('GraphQL Error:', error);
                logger.error('GraphQL Error', { 
                  message: error.message,
                  path: error.path,
                  locations: error.locations,
                  stack: error.extensions?.exception?.stacktrace
                });
              });
            },
          }),
        },
      ],
    });

    await server.start();
    server.applyMiddleware({ app });

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}${server.graphqlPath}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

startServer();