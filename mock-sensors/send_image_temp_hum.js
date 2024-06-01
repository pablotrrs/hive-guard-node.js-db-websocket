// common logic for mock sensors
const fs = require("fs");
const ffmpeg = require("ffmpeg");
const WebSocket = require("ws");
const pth = require("path");
const cleanup = require('node-cleanup');
const http = require("http");
const videoDir = pth.join(__dirname, './video');
const firstVideoFile = fs.readdirSync(videoDir).find((file) => pth.extname(file) === ".mp4");
const path = pth.join(videoDir, firstVideoFile);
const outputTo = pth.join(__dirname, 'images');
const fps = 30;

let images = [];

const extractImages = () => {
    return new Promise((resolve, reject) => {
        try {
            new ffmpeg(path, function (err, video) {
                if (!err) {
                    video.fnExtractFrameToJPG(outputTo, {
                        every_n_frames: 1, // Extract every frame
                        file_name: "image_%t_%s",
                    }, function (error, files) {
                        if (error) {
                            reject(error);
                        } else {
                            images = files;
                            resolve();
                        }
                    });
                } else {
                    reject(err);
                }
            });
        } catch (err) {
            reject(err);
        }
    });
};

const sendImages = (ws) => {
    let index = 0;
    setInterval(() => {
        if (index >= images.length) {
            index = 0; // Reset index to start
        }
        const file = images[index];
        const data = fs.readFileSync(file);
        ws.send(data);
        index++;
    }, 1000 / fps);
};

const sendTemperatureAndHumidity = (ws) => {
    let temp = 30;
    let hum = 70;
    setInterval(() => {
        temp += (Math.random() * 0.2 - 0.1);
        hum += (Math.random() * 0.4 - 0.2);

        // Ensure temp and hum stay within the desired range
        temp = Math.min(Math.max(temp, 30), 40);
        hum = Math.min(Math.max(hum, 60), 80);

        let output = "temp=" + temp.toFixed(2) + ",hum=" + hum.toFixed(2) + ",light=12;state:ON_BOARD_LED_1=0";

        ws.send(output);
    }, 1000);
};

function getSensorRegistrationData(wsPort, expressAppPort) {
    const randomId = Math.floor(Math.random() * 1000000);

    let sensorData = {
        "id": `esp32cam${randomId}`,
        "wsPort": `${wsPort}`,
        "appPort": `${expressAppPort}`,
        "saveSensorData": true,
        "detectObjects": true,
        "class": "cam-instance",
        "display": `Cam #${randomId}`,
        "ip": "127.0.0.1",
        "commands": [{
            "id": "ON_BOARD_LED", "name": "Camera flashlight", "class": "led-light", "state": 0
        }]
    };

    return JSON.stringify(sensorData);
}

// ----------------------------MASTER DISCOVERY----------------------------

// irl streamer should hit every ip in the network until it finds the master
function hitMasterSoItHitsBack_WithItsIp(masterIp, _wsPort) {
    wsPort = _wsPort;
    appPort = Number(wsPort) + 1000;
    return new Promise((resolve, reject) => {
        const sensorData = getSensorRegistrationData(wsPort, appPort);

        const options = {
            hostname: masterIp,
            port: 8000,
            path: '/isMaster',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': sensorData.length
            }
        };

        const req = http.request(options, (res) => {
            console.log(`statusCode: ${res.statusCode}`);

            res.on('data', (d) => {
                console.log('Received: ' + d);
            });

            res.on('end', () => {
                resolve();
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(sensorData);
        req.end();
    }).catch((error) => {
        if (error.code === 'ECONNREFUSED') {
            throw new Error('Master server should be running before this mock esp32 streamer!');
        } else {
            throw error;
        }
    });
}

exports.connectWithMaster_AndSendDataOver = function (masterIp, wsPort, appPort) {

    hitMasterSoItHitsBack_WithItsIp(masterIp, wsPort).then(() => {
        const express = require('express');
        const app = express();

        if (!appPort || !wsPort) {
            console.error('appPort and wsPort must be defined');
            process.exit(1);
        }

        app.listen(appPort, () => {
            console.log('Mock sensor is listening on port ' + appPort
                + ' and waiting to connect to WebSocket on port ' + wsPort);
        });

        app.use(express.json());

        // 1st we hit master for him to create the ws with the port we gave him and send its ip back,
        // 2nd we connect to the created ws and start sending images and sensor data
        app.post('/iAmMaster', (req, res) => {
            console.log("this is not being executed!")
            let masterServerIp = req.body.clientIp;

            console.log(`Master server IP saved successfully: ${masterServerIp}`);
            console.log('Ready for websocket connection');

            let ws = new WebSocket(`ws://${masterServerIp}:${wsPort}`);

            ws.on("open", async () => {
                await extractImages();
                sendImages(ws);
                sendTemperatureAndHumidity(ws);
            });

            ws.on("error", function error(err) {
                console.error("WebSocket error:", err);
            });
        });
    });
}

// ---------------------------- CLEANUP ----------------------------

function deleteExtractedFiles() {
    fs.readdir(outputTo, (err, files) => {
        if (err) throw err;

        for (const file of files) {
            fs.unlink(pth.join(outputTo, file), err => {
                if (err) throw err;
            });
        }
    });
}

cleanup((exitCode, signal) => {
    console.log("Cleaning up...")
    console.log(".")
    if (signal) {
        console.log(".")
        deleteExtractedFiles();
        setTimeout(() => {
            console.log(".")
            cleanup.uninstall();
            process.kill(process.pid, signal);
        }, 10000);
    }
    return false;
});