FROM node:22

# Install Docker client
RUN apt-get update && \
    apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release && \
    curl -fsSL https://get.docker.com -o get-docker.sh && \
    sh get-docker.sh

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
RUN apt-get update && apt-get install -y dnsutils
RUN npm rebuild @tensorflow/tfjs-node --build-from-source
COPY . .
CMD [ "node", "server.js" ]