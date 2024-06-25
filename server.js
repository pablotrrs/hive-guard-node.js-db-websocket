const { exec } = require('child_process');
const { fork } = require('child_process');
require('dotenv').config();

if (process.env.IS_DOCKER_COMPOSE === 'true') {
  console.log('Mock sensor data streamer 1 running in docker-compose mode')
  exec('nslookup db', (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`nslookup output: ${stdout}`);
    const ip = stdout.split('\n').filter(line => line.trim().startsWith('Address:')).pop().split(' ')[1];
    console.log(`Database IP is: ${ip}`);
    process.env.MONGODB_IP = ip;
  });
}

// --------------- WORKERS INITIALIZATION ---------------

const fs = require("fs");
const path = require('path');
const os = require('os');
const cores = os.cpus().length;
const cluster = require('cluster');
const globalSensorData = require('./global_sensor_data');
const workers = new Map();
const { Sensor } = require('./sensor_model');

// --------------- SENSOR UPDATE ---------------

function updateSensors(updatedSensor) {
  globalSensorData[updatedSensor.key] = updatedSensor;
}

// --------------- WEBSOCKET MESSAGE HANDLING ---------------

const WebSocket = require('ws');

async function handleWebSocketMessage(ws, data) {
  if (ws.readyState !== ws.OPEN) return;

  try {
    data = JSON.parse(data);

    if (data.operation === 'function') {
      const sensorToUpdate = sensorsArray.find(sensor => sensor.key === data.command.recipient);
      if (sensorToUpdate) {
        const targetWorker = [...workers.entries()].find(([, port]) => port === sensorToUpdate.port)?.[0];
        if (targetWorker) {
          targetWorker.send({
            update: 'command', data: `${data.command.message.key}=${data.command.message.value}`
          });
        }
      }
    } else if (data.operation === 'getSensors') {
      try {
        const sensorIDs = await Sensor.getAllSensorIDs();
        console.log(`Retrieved unique sensorIDs: ${JSON.stringify(sensorIDs, null, 2)}`);

        ws.send(JSON.stringify({
          'operation': 'sendSensors', 'sensorIDs': sensorIDs
        }));
      } catch (err) {
        console.error(`Error getting sensorIDs: ${err}`);
      }
    } else if (data.operation === 'getSensorReadings') {
      try {
        const { sensorId, startTime, endTime } = data.command;
        const sensorData = await Sensor.getSensorDataByIdBetweenTimestamps(sensorId, startTime, endTime);
        console.log(`Retrieved sensor data for sensorId "${sensorId}" between "${startTime}" and "${endTime}": ${JSON.stringify(sensorData, null, 2)}`);

        ws.send(JSON.stringify({
          'operation': 'sendSensorReadings', 'sensorData': sensorData
        }));
      } catch (err) {
        console.error(`Error getting sensor data: ${err}`);
      }
    }
  } catch (error) {
  }
}

// --------------- WEBSOCKET SERVER INITIALIZATION ---------------
const connectedClients = new Set();
const clientWs = new WebSocket.Server({
  host: getMfMasterServerIp(), port: process.env.CLIENT_WS_PORT
}, () => console.log(`Client WS Server is listening at 127.0.0.1:${process.env.CLIENT_WS_PORT}`));

setInterval(() => {
  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ devices: Object.values(globalSensorData) }));
    }
  }
}, process.env.CLIENT_UPDATE_FREQUENCY);

clientWs.on('connection', (ws) => {
  connectedClients.add(ws);
  ws.on('message', (data) => handleWebSocketMessage(ws, data));
  ws.on('close', () => {
    connectedClients.delete(ws);
  });
});

// --------------- EXPRESS SERVER INITIALIZATION ---------------

const express = require('express');
const app = express();
const bodyParser = require('body-parser');

// Middleware to parse JSON bodies
app.use(express.json());
app.use(bodyParser.json());

// Middleware to log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip}, User-Agent: ${req.get('User-Agent')}`);
  next();
});

app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/react', express.static(path.join(__dirname, 'public/pages/react_test/build')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public/pages/client1'));
app.get('/client', (_req, res) => {
  res.render('client', { env: process.env });
});
app.get('/client2', (_req, res) => {
  res.sendFile(path.resolve(__dirname, './public/pages/client2/client.ejs'));
});
app.get('/react/*', (_req, res) => {
  res.sendFile(path.resolve(__dirname, './public/pages/react_test/build/index.html'));
});

app.post('/api/config', (req, res) => {
  const { TEMP_MIN_THRESHOLD, TEMP_MAX_THRESHOLD, HUM_THRESHOLD, EMAIL_USER, EMAIL_PASS, EMAIL_RECIPIENT } = req.body;

  if (TEMP_MIN_THRESHOLD) process.env.TEMP_MIN_THRESHOLD = TEMP_MIN_THRESHOLD;
  if (TEMP_MAX_THRESHOLD) process.env.TEMP_MAX_THRESHOLD = TEMP_MAX_THRESHOLD;
  if (HUM_THRESHOLD) process.env.HUM_THRESHOLD = HUM_THRESHOLD;
  if (EMAIL_USER) process.env.EMAIL_USER = EMAIL_USER;
  if (EMAIL_PASS) process.env.EMAIL_PASS = EMAIL_PASS;
  if (EMAIL_RECIPIENT) process.env.EMAIL_RECIPIENT = EMAIL_RECIPIENT;

  for (const worker of workers.keys()) {
    worker.send({ update: 'updatedEnvVars', data: req.body });
  }
  res.send('Environment variables updated successfully');
});

let alerts = [];
app.get('/api/alerts', (req, res) => {

  res.send(alerts);
  alerts = [];
});


let hives = new Map();
app.get('/api/hives', async (req, res) => {
  
  res.send(Array.from(hives.entries()))
});

app.get('/api/healthcheck', (req, res) => {

  res.send('OK');
});

const http = require("http");
const cleanup = require("node-cleanup");

app.use(express.json());

function getMfMasterServerIp() {
  if (process.env.NODE_ENV === 'production') {

    process.env.MASTER_SERVER_PUBLIC_IP = process.env.NGROK_URL;
    console.log("Master server public IP is: " + process.env.MASTER_SERVER_IP);
  }

  const networkInterfaces = os.networkInterfaces();
  let localIp;
  for (let name of Object.keys(networkInterfaces)) {
    for (let net of networkInterfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address;
        break;
      }
    }
    if (localIp) {
      break;
    }
  }

  process.env.MASTER_SERVER_LOCAL_IP = localIp;
  console.log("Master server local IP is: " + process.env.MASTER_SERVER_IP);

  return localIp;
}

const dgram = require('dgram');
const udpServer = dgram.createSocket('udp4');

const httpServer = app.listen(process.env.CLIENT_HTTP_PORT, () => {
  const networkInterfaces = os.networkInterfaces();
  let serverIp;
  for (let name of Object.keys(networkInterfaces)) {
    for (let net of networkInterfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        serverIp = net.address;
        break;
      }
    }
    if (serverIp) {
      break;
    }
  }
  console.log(`HTTP server starting on ${process.env.CLIENT_HTTP_PORT} with process ID ${process.pid} and IP ${serverIp}`);
});

httpServer.on('error', (error) => {
  console.error(`Failed to bind to port ${process.env.CLIENT_HTTP_PORT}:`, error);
});

const axios = require('axios');

async function getLocationFromIP(ip) {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        return response.data;
    } catch (error) {
        console.error(error);
    }
}

function pimpHiveData(sensorRegistrationJson) {
  return async function() {
    const location = await getLocationFromIP(sensorRegistrationJson.ip);
    return {
      ...sensorRegistrationJson,
      location: location
    };
  };
}

function handleSensorRegistration(sensorRegistrationJson) {
  console.log("ESP32 making the request IP address is: " + sensorRegistrationJson.ip);

  const clientIp = getMfMasterServerIp();
  cluster.setupMaster({ exec: path.join(__dirname, 'sensor_worker.js') });

  console.log("About to fork worker process...");
  const worker = cluster.fork();
  console.log("Worker process forked");

  worker.send({ update: 'sensor', data: sensorRegistrationJson });

  console.log("Setting up message listener...");
  worker.on('message', (message) => {
    if (message.update === 'workerInitialized') {
      console.log("Worker process initialized, about to hit streamer back in ip " + sensorRegistrationJson.ip + " and port " + sensorRegistrationJson.appPort);
      let json = JSON.stringify({ clientIp: clientIp });
      const post_options = {
        hostname: sensorRegistrationJson.ip,
        port: sensorRegistrationJson.appPort,
        method: "POST",
        path: "/iAmMaster",
        headers: {
          "Content-Type": "application/json"
        }
      }

      const post_request = http.request(post_options);

      post_request.on('error', (error) => {
        console.error(`Failed to hit streamer back :( `, error);
      });

      post_request.write(json);
      post_request.end();

      // hives.set(sensorRegistrationJson.id, pimpHiveData(sensorRegistrationJson));
      // let hiveData = pimpHiveData(sensorRegistrationJson);
      // hives.set(sensorRegistrationJson.id, hiveData);
      hives.set(sensorRegistrationJson.id, sensorRegistrationJson);
    }
    if (message.update === 'sensor') {
      updateSensors(message.data);
    }
    if (message.update === 'newAlert') {
      // the alert is added to the alerts array of the hive, and the alerts array of the server
      let hive = hives.get(message.data.sensorId);
      if (hive) {
        if (!hive.alerts) {
          hive.alerts = [];
        }
        hive.alerts.push(message.data);
      } else {
        hives.set(message.data.sensorId, { ...message.data, alerts: [message.data] });
      }

      alerts.push(message.data);
    }
  });

  console.log("Message listener set up.");
  workers.set(worker, sensorRegistrationJson.wsPort);
}

udpServer.on('message', (msg, rinfo) => {
  console.log(`Server got UDP broadcast message: ${msg} from ${rinfo.address}:${rinfo.port}`);
  try {
    const jsonData = JSON.parse(msg.toString());
    console.log("Parsed received JSON data from UDP broadcast: ", jsonData);

    if (jsonData) {
      const responseMessage = `Master server`;
      udpServer.send(responseMessage, 0, responseMessage.length, rinfo.port, rinfo.address, (err) => {
        if (err) console.error('Error sending response:', err);
        else console.log('Response sent to', jsonData.ip);
      });
      handleSensorRegistration(jsonData)
    }
  } catch (e) {
    console.error('Failed to parse JSON data:', e);
  }
});

udpServer.bind(process.env.CLIENT_UDP_PORT, () => {
  console.log(`Master Server listening for UDP broadcasts on port ${process.env.CLIENT_UDP_PORT}`);
});

// log the server ip address
const ifaces = os.networkInterfaces();
Object.keys(ifaces).forEach(ifname => {
  let alias = 0;

  ifaces[ifname].forEach(iface => {
    if ('IPv4' !== iface.family || iface.internal !== false) {
      return;
    }

    if (alias >= 1) {
      console.log(ifname + ':' + alias, iface.address);
    } else {
      console.log(ifname, iface.address);
    }
    ++alias;
  });
});

// --------------- ON SERVER SHUTDOWN ---------------
function cleanupAndExit() {
  console.log('Server is shutting down...');
  for (const worker of workers.keys()) {
    worker.send({ update: 'close' });
  }

  try {
    clientWs.close();
    console.log('WebSocket server has been closed');
  } catch (error) {
    console.error('Error when closing WebSocket server:', error);
  }

 console.log('All workers have been closed');
  console.log('Bye!');

  process.exit();
}

cleanup((exitCode, signal) => {
  console.log(".")
  if (signal) {
    cleanupAndExit();
    setTimeout(() => {
      process.kill(process.pid, signal);
    }, 10000);
  }
  return false;
});
