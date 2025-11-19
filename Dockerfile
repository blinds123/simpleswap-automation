# Use Apify's Playwright Python base image
FROM apify/actor-python-playwright:3.11

# Copy requirements
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY main.py ./

# Run the actor
CMD ["python3", "-u", "main.py"]
