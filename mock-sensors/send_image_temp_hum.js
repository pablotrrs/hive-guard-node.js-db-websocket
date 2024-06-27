// common logic for mock sensors
const os = require('os');
const fs = require("fs");
const ffmpeg = require("ffmpeg");
const WebSocket = require("ws");
const pth = require("path");
const cleanup = require('node-cleanup');
const http = require("http");
const dgram = require('dgram');
const udpServer = dgram.createSocket('udp4');
const videoDir = pth.join(__dirname, './video');
const firstVideoFile = fs.readdirSync(videoDir).find((file) => pth.extname(file) === ".mp4");
const path = pth.join(videoDir, firstVideoFile);
const outputTo = pth.join(__dirname, 'images');
const fps = 30;

let images = [];
let masterIp = '';

const extractImages = () => {
  return new Promise((resolve, reject) => {
    try {
      new ffmpeg(path, function(err, video) {
        if (!err) {
          video.fnExtractFrameToJPG(outputTo, {
            every_n_frames: 1,
            file_name: "image_%t_%s",
          }, function(error, files) {
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

// Temperature, humidity and maybe battery level
const sendStreamerData = (ws, sendBattery) => {
  let temp = 30;
  let hum = 70;
  setInterval(() => {
    temp += (Math.random() * 0.2 - 0.1);
    hum += (Math.random() * 0.4 - 0.2);

    // Ensure temp and hum stay within the desired range
    temp = Math.min(Math.max(temp, 30), 40);
    hum = Math.min(Math.max(hum, 60), 80);

    let output = "temp=" + temp.toFixed(2) + ",hum=" + hum.toFixed(2) + ",light=12;state:ON_BOARD_LED_1=0" +
        "batteryEnabled=" + sendBattery + ";battery=" + (sendBattery ? 100 : 0);

    ws.send(output);
  }, 1000);
};

function getMockSensorIp() {
  const networkInterfaces = os.networkInterfaces();
  let ip;
  for (let name of Object.keys(networkInterfaces)) {
    for (let net of networkInterfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ip = net.address;
        break;
      }
    }
    if (ip) {
      break;
    }
  }
  return ip;
}

function getSensorRegistrationData(wsPort, expressAppPort) {
  const randomId = Math.floor(Math.random() * 1000000);

  const ip = getMockSensorIp();

  console.log(`IP of mock sensor data streamer: ${ip}`)
  let sensorData = {
    "id": `esp32cam${randomId}`,
    "wsPort": `${wsPort}`,
    "appPort": `${expressAppPort}`,
    "saveSensorData": true,
    "detectObjects": true,
    "class": "cam-instance",
    "display": `Cam #${randomId}`,
    "ip": `${ip}`,
    "commands": [{
      "id": "ON_BOARD_LED", "name": "Camera flashlight", "class": "led-light", "state": 0
    }]
  };

  return JSON.stringify(sensorData);
}

// ----------------------------MASTER DISCOVERY----------------------------

exports.connectWithMaster_AndSendDataOver = function(wsPort, appPort, udpPort, sendsBattery) {
  function broadcastMessage(message) {
    const messageBuffer = Buffer.from(message);

    udpServer.send(messageBuffer, 0, messageBuffer.length, 12345, '255.255.255.255', function(err, bytes) {
      if (err) {
        console.log('Error broadcasting message: ', err);
      } else {
        console.log('Message broadcasted successfully');
      }
    });
  }

  function broadcastMasterSoItHitsBack_WithItsIp(_wsPort) {
    return new Promise((resolve, reject) => {
      let wsPort = _wsPort;
      let appPort = Number(wsPort) + 1000;
      const sensorData = getSensorRegistrationData(wsPort, appPort);
      broadcastMessage(sensorData);
      resolve();
    })
  };

  udpServer.bind(udpPort);

  udpServer.on('error', (err) => {
    console.log(`Mock streamer udp server error:\n${err.stack}`);
    udpServer.close();
  });

  udpServer.on('message', (msg, rinfo) => {
    console.log(`Mock streamer udp server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
    masterIp = rinfo.address;
  });

  udpServer.on('listening', () => {
    const address = udpServer.address();
    console.log(`Mock streamer udp server listening ${address.address}:${address.port}`);

    udpServer.setBroadcast(true);
  });

  broadcastMasterSoItHitsBack_WithItsIp(wsPort).then(() => {
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

    // 1st we broadcast a udp packet for master to receive it and create the ws with the port we gave him and
    // send its ip back,
    // 2nd we connect to the created ws and start sending images and sensor data
    app.post('/iAmMaster', (req, res) => {
      let masterServerIp = req.body.clientIp;

      console.log(`Master server IP saved successfully: ${masterServerIp}`);
      console.log('Ready for websocket connection');

      let ws = new WebSocket(`ws://${masterServerIp}:${wsPort}`);

      ws.on("open", async () => {
        await extractImages();
        sendImages(ws);
        sendStreamerData(ws, sendsBattery);
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
