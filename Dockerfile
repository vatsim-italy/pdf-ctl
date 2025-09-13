# Use official Node.js LTS image
FROM node:slim

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose the internal container port
EXPOSE 3001

# Command to run the app
CMD ["node", "index.js"]
