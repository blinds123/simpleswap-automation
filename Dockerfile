# Use the official Apify image for Node.js actors (includes Playwright)
FROM apify/actor-node:latest

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Expose port (Render provides PORT env var)
EXPOSE 3000

# Start the server
CMD ["node", "pool-server-production.js"]
