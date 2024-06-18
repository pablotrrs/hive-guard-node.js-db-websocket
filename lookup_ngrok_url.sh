#!/bin/bash

echo "Starting lookup_ngrok_url.sh script..."

# Dynamically get the ID of the ngrok container
echo "Getting the ID of the ngrok container..."
NGROK_CONTAINER_ID=$(docker ps -qf "name=master-server-ngrok-1")

# Wait for the ngrok container to start
while [ -z "$NGROK_CONTAINER_ID" ]; do
  echo "Waiting for the ngrok container to start..."
  sleep 1
  NGROK_CONTAINER_ID=$(docker ps -qf "name=master-server-ngrok-1")
done

echo "Ngrok container started with ID: $NGROK_CONTAINER_ID"

# Wait for the ngrok container to start and establish a tunnel
echo "Waiting for the ngrok container to start and establish a tunnel..."
while [ -z "$(docker logs $NGROK_CONTAINER_ID 2>&1 | grep 'started tunnel')" ]; do
  echo "These are the logs I read from the container $NGROK_CONTAINER_ID:"
  docker logs $NGROK_CONTAINER_ID
  echo "Waiting for ngrok to start..."
  sleep 1
done

# Extract the ngrok URL from the logs
echo "Extracting the ngrok URL from the logs..."
NGROK_URL=$(docker logs $NGROK_CONTAINER_ID 2>&1 | grep 'started tunnel' | awk -F'=' '{print $NF}')

# Export the ngrok URL as an environment variable
echo "Exporting the ngrok URL as an environment variable..."
export NGROK_URL=$NGROK_URL

# Start your server
echo "Starting server.js..."
node -r dotenv/config server.js NGROK_URL=$NGROK_URL