
# Use official Node.js image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the Frontend port
EXPOSE 3000

# Start the development server (or serve build for production)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
