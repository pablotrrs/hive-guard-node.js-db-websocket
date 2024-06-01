require('dotenv').config();

// --------------- WORKERS INITIALIZATION ---------------

const fs = require("fs");
const path = require('path');
const os = require('os');
const cores = os.cpus().length;
const cluster = require('cluster');
const globalSensorData = require('./global_sensor_data');
const workers = new Map();
const {Sensor} = require('./sensor_model');

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
                const {sensorId, startTime, endTime} = data.command;
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
const clientWs = new WebSocket.Server({port: process.env.CLIENT_WS_PORT}, () => console.log(`WS Server is listening at ${process.env.CLIENT_WS_PORT}`));

setInterval(() => {
    for (const client of connectedClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({devices: Object.values(globalSensorData)}));
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
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/react', express.static(path.join(__dirname, 'public/pages/react_test/build')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public/pages/client1'));
app.get('/client', (_req, res) => {
    res.render('client', {env: process.env});
});
app.get('/client2', (_req, res) => {
    res.sendFile(path.resolve(__dirname, './public/pages/client2/client.ejs'));
});
app.get('/react/*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, './public/pages/react_test/build/index.html'));
});

app.use(express.json());
app.post('/api/config', (req, res) => {
    const {TEMP_MIN_THRESHOLD, TEMP_MAX_THRESHOLD, HUM_THRESHOLD, EMAIL_USER, EMAIL_PASS, EMAIL_RECIPIENT} = req.body;

    if (TEMP_MIN_THRESHOLD) process.env.TEMP_MIN_THRESHOLD = TEMP_MIN_THRESHOLD;
    if (TEMP_MAX_THRESHOLD) process.env.TEMP_MAX_THRESHOLD = TEMP_MAX_THRESHOLD;
    if (HUM_THRESHOLD) process.env.HUM_THRESHOLD = HUM_THRESHOLD;
    if (EMAIL_USER) process.env.EMAIL_USER = EMAIL_USER;
    if (EMAIL_PASS) process.env.EMAIL_PASS = EMAIL_PASS;
    if (EMAIL_RECIPIENT) process.env.EMAIL_RECIPIENT = EMAIL_RECIPIENT;

    res.send('Environment variables updated successfully');
});

const http = require("http");
const cleanup = require("node-cleanup");

app.use(express.json());


app.post('/isMaster', (_req, res) => {
    const sensorRegistrationJson = _req.body;
    console.log("received request");
    res.setHeader('Master', 'Yes');
    res.status(200).send('Master server\r');
    console.log("ESP32 making the request IP address is: " + sensorRegistrationJson.ip);

    const clientIp = process.env.CLIENT_SERVER_IP;

    cluster.setupPrimary({exec: path.join(__dirname, 'sensor_worker.js')});

    console.log("About to fork worker process...");
    const worker = cluster.fork();
    console.log("Worker process forked.");

    worker.send({update: 'sensor', data: sensorRegistrationJson});

    console.log("Setting up message listener...");
    worker.on('message', (message) => {
        if (message.update === 'workerInitialized') {
            console.log("(let him cook)")
            console.log("all the mf data when about to hit sensor back", sensorRegistrationJson);
            let json = JSON.stringify({clientIp: clientIp});
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

            post_request.write(json)
            post_request.end();
        }
        if (message.update === 'sensor') {
            updateSensors(message.data);
        }
    });

    console.log("Message listener set up.");
    workers.set(worker, sensorRegistrationJson.wsPort);
});

app.listen(process.env.CLIENT_HTTP_PORT, () => {
    console.log(`HTTP server starting on ${process.env.CLIENT_HTTP_PORT} with process ID ${process.pid}`);
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
        worker.send({update: 'close'});
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