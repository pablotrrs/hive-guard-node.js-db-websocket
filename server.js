require('dotenv').config();

// --------------- MULTITHREADING CONFIG ---------------
// --------------- WORKERS INITIALIZATION ---------------

// const fs = require("fs");
// const path = require('path');
// const os = require('os');
// const cores = os.cpus().length;
// const cluster = require('cluster');
// const globalSensorData = require('./global_sensor_data');
// const {Sensor} = require('./sensor_model');
// const workers = new Map();
// const { eventEmitter } = require('./master_discovery');
// const sensorsPath = path.join(__dirname, 'sensors.json');
// let sensorsPerWorker;
// const http = require("http");
// const sensors = require(sensorsPath);
//
// // TODO esto también tiene que ser para cuando se agrega uno aparte de la inicialización
// eventEmitter.on('sensorIsRequestingToConnect', (sensorRegistrationJson) => {
//     writeSensorJsonToFile(sensorRegistrationJson, sensorsPath);
//
//     const sensorsData = fs.readFileSync(sensorsPath, 'utf8');
//     const sensors = JSON.parse(sensorsData);
//     const sensorsArray = Object.entries(sensors).map(([key, value]) => ({key, ...value}));
//     initializeSensors(sensorsArray);
// });
//
// function writeSensorJsonToFile(sensorRegistrationJson, sensorsFilePath) {
//     try {
//         const data = fs.readFileSync(sensorsFilePath, 'utf8');
//         const sensors = JSON.parse(data);
//
//         Object.assign(sensors, sensorRegistrationJson);
//
//         fs.writeFileSync(sensorsFilePath, JSON.stringify(sensors, null, 2), 'utf8');
//     } catch (err) {
//         console.error(`Error reading or writing file: ${err}`);
//     }
// }

const fs = require("fs");
const path = require('path');
const os = require('os');
const cores = os.cpus().length;
const cluster = require('cluster');
const globalSensorData = require('./global_sensor_data');
// const sensors = require('./sensors.json');
// const sensorsArray = Object.entries(sensors).map(([key, value]) => ({key, ...value}));
// const sensorsPerWorker = Math.ceil(sensorsArray.length / cores);
const workers = new Map();
const {Sensor} = require('./sensor_model');

function initializeSensors() {
    const sensors = {
        "esp32cam1": {
            "port": 8003,
            "saveSensorData": true,
            "detectObjects": true,
            "class": "cam-instance",
            "display": "Cam #1",
            "commands": [
                {
                    "id": "ON_BOARD_LED",
                    "name": "Camera flashlight",
                    "class": "led-light",
                    "state": 0
                }
            ]
        },
        "esp32cam2": {
            "port": 8001,
            "saveSensorData": true,
            "detectObjects": true,
            "class": "cam-instance",
            "display": "Cam #2",
            "commands": [
                {
                    "id": "ON_BOARD_LED",
                    "name": "Camera flashlight",
                    "class": "led-light",
                    "state": 0
                }
            ]
        }
    };

    const sensorsArray = Object.entries(sensors).map(([key, value]) => ({ id: key, ...value }));
    const sensorsPerWorker = Math.ceil(sensorsArray.length / cores);

    console.log(`Total CPUs (Logical cores): ${cores}`);
    console.log(`Total sensors: ${sensorsArray.length}`);
    console.log(JSON.stringify(sensorsArray, null, 2));
    cluster.setupPrimary({exec: path.join(__dirname, 'sensor_worker.js')});

    for (let i = 0; i < cores; i++) {
        const workerSensors = sensorsArray.slice(i * sensorsPerWorker, (i + 1) * sensorsPerWorker);
        if (workerSensors.length === 0) continue;

        const worker = cluster.fork();
        worker.send({update: 'sensor', data: workerSensors[0]});

        worker.on('message', (message) => {
            if (message.update === 'sensor') {
                updateSensors(message.data);
            }
        });

        workers.set(worker, workerSensors[0].port);
    }
}

// --------------- SENSOR UPDATE ---------------

function updateSensors(updatedSensor) {
    globalSensorData[updatedSensor.key] = updatedSensor;

    // if (updatedSensor.sensors) {
    //     for (const [sensorKey, sensorValue] of Object.entries(updatedSensor.sensors)) {
    //         if (sensorKey === 'temp' && sensorValue > process.env.TEMP_THRESHOLD) {
    //             sendEmail('Temperature Alert', `Sensor ${updatedSensor.key} exceeded the temperature threshold. Temperature: ${sensorValue}`);
    //         } else if (sensorKey === 'hum' && sensorValue > process.env.HUM_THRESHOLD) {
    //             sendEmail('Humidity Alert', `Sensor ${updatedSensor.key} exceeded the humidity threshold. Humidity: ${sensorValue}`);
    //         }
    //     }
    // }
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
                        update: 'command',
                        data: `${data.command.message.key}=${data.command.message.value}`
                    });
                }
            }
        } else if (data.operation === 'getSensors') {
            try {
                const sensorIDs = await Sensor.getAllSensorIDs();
                console.log(`Retrieved unique sensorIDs: ${JSON.stringify(sensorIDs, null, 2)}`);

                ws.send(JSON.stringify({
                    'operation': 'sendSensors',
                    'sensorIDs': sensorIDs
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
                    'operation': 'sendSensorReadings',
                    'sensorData': sensorData
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
    res.render('client', { env: process.env });
});
app.get('/client2', (_req, res) => {
    res.sendFile(path.resolve(__dirname, './public/pages/client2/client.ejs'));
});
app.get('/react/*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, './public/pages/react_test/build/index.html'));
});

app.use(express.json());
app.post('/api/config', (req, res) => {
    const { TEMP_MIN_THRESHOLD, TEMP_MAX_THRESHOLD, HUM_THRESHOLD, EMAIL_USER, EMAIL_PASS, EMAIL_RECIPIENT } = req.body;

    if (TEMP_MIN_THRESHOLD) process.env.TEMP_MIN_THRESHOLD = TEMP_MIN_THRESHOLD;
    if (TEMP_MAX_THRESHOLD) process.env.TEMP_MAX_THRESHOLD = TEMP_MAX_THRESHOLD;
    if (HUM_THRESHOLD) process.env.HUM_THRESHOLD = HUM_THRESHOLD;
    if (EMAIL_USER) process.env.EMAIL_USER = EMAIL_USER;
    if (EMAIL_PASS) process.env.EMAIL_PASS = EMAIL_PASS;
    if (EMAIL_RECIPIENT) process.env.EMAIL_RECIPIENT = EMAIL_RECIPIENT;

    res.send('Environment variables updated successfully');
});

const masterDiscovery = require('./master_discovery');
const child_process = require("child_process");

app.use(express.json());

app.post('/isMaster', (req, res) => {
    const sensorRegistrationJson = req.body;
    masterDiscovery.isMaster(req, res, sensorRegistrationJson);
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


initializeSensors();

// --------------- ON SERVER SHUTDOWN ---------------
function cleanupAndExit() {
    console.log('Server is shutting down...');
    for (const worker of workers.keys()) {
        worker.send({ update: 'close' });
    }

    clientWs.close();

    console.log('All workers have been closed');

    // fs.writeFileSync(path.join(__dirname, 'sensors.json'), JSON.stringify({}, null, 2), 'utf8');
    //
    // console.log('All registered sensors have been deleted');
    console.log('Bye!');

    process.exit();
}

process.on("SIGINT", cleanupAndExit);
process.on("SIGTERM", cleanupAndExit);