FROM python:3.11-slim

# Install system dependencies for audio and robot control
RUN apt-get update && apt-get install -y \
    portaudio19-dev \
    libasound2-dev \
    libopencv-dev \
    python3-opencv \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the bridge code and other scripts
COPY . .

# Set environment variables
ENV PIPECAT_REPO_PATH=/app/pipecat
ENV PORT=5002

# The Pipecat bridge runs on 5002
EXPOSE 5002

# Run the FastAPI bridge
CMD ["python", "pipecat_bridge.py"]
