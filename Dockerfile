# Use Node.js 20 base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the source files
COPY . .

# Build the frontend assets and server bundle
RUN npm run build

# Expose port 7860 (Hugging Face standard)
ENV PORT=7860
EXPOSE 7860

# Start the application
CMD ["npm", "run", "start"]
