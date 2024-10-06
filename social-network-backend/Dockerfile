# Use an official Node runtime as the parent image
FROM node:14

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the entire src directory
COPY src ./src

# Copy any other necessary files (e.g., .env, if you're using it)
COPY .env* ./

# Expose the port the app runs on
EXPOSE 4000

# Define the command to run the app
CMD ["node", "src/server.js"]
