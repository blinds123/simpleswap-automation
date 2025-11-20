# Use official Microsoft Playwright image (includes Node.js + Playwright + all browsers)
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (Playwright is already in the base image)
RUN npm install --production

# Copy application files
COPY . .

# Expose port (Render provides PORT env var)
EXPOSE 3000

# Start the server
CMD ["node", "pool-server-production.js"]
