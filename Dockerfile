# Use Apify's standard Python base image with Crawlee
FROM apify/actor-python:3.11

# Copy requirements
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY main_puppeteer.py ./main.py

# Run the actor
CMD ["python3", "-u", "main.py"]
