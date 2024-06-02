FROM node:22
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
RUN apt-get update && apt-get install -y dnsutils
RUN npm rebuild @tensorflow/tfjs-node --build-from-source
COPY . .
CMD [ "node", "server.js" ]