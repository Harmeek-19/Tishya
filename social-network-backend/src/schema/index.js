const { gql } = require('apollo-server-express');

const typeDefs = gql`
  scalar Email

  type User {
    id: ID!
    username: String!
    email: Email!
    role: String!
    profilePicture: String
    bio: String
    projects: [Project!]
    institutions: [Institution!]
    posts: [Post!]
    comments: [Comment!]
    connections: [User!]
  }

  type Project {
    id: ID!
    name: String!
    description: String!
    owner: User!
    collaborators: [User!]
  }

  type Institution {
    id: ID!
    name: String!
    type: String!
    members: [User!]
  }

  type Post {
    id: ID!
    content: String!
    author: User!
    createdAt: String!
    likesCount: Int!
    likes: [User!]!
    comments: [Comment!]!
  }

  type Like {
    id: ID!
    user: User!
    post: Post!
    createdAt: String!
  }

  type Comment {
    id: ID!
    content: String!
    author: User!
    post: Post!
    createdAt: String!
  }

  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  type RefreshTokenPayload {
    accessToken: String!
    refreshToken: String!
  }

  type Query {
    getUser(id: ID!): User
    getProject(id: ID!): Project
    getInstitution(id: ID!): Institution
    getFeed(userId: ID!): [Post!]
    getUserProjects(userId: ID!): [Project!]
    getUserInstitutions(userId: ID!): [Institution!]
    getPostLikes(postId: ID!): [User!]!
  }

  type UserWithConnections {
    id: ID!
    username: String!
    connections: [User!]!
    newConnectionCreated: Boolean!
  }

  type Mutation {
    createUser(username: String!, email: Email!, password: String!, role: String): User
    updateUser(id: ID!, username: String, email: Email, bio: String): User
    createProject(name: String!, description: String!): Project
    addCollaborator(projectId: ID!, userId: ID!): Project
    createInstitution(name: String!, type: String!): Institution
    joinInstitution(institutionId: ID!): Institution
    createPost(content: String!): Post
    addComment(postId: ID!, content: String!): Comment!
    addConnection(userId: ID!): UserWithConnections!
    login(email: Email!, password: String!): AuthPayload!
    refreshToken(refreshToken: String!): RefreshTokenPayload!
    logout: Boolean!
    promoteToAdmin(userId: ID!): User
    resetSequences: Boolean!
    likePost(postId: ID!): Post!
    unlikePost(postId: ID!): Post!
  }
`;

module.exports = { typeDefs };