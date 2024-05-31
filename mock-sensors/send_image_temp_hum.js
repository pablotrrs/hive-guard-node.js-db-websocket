// common logic for mock sensors
const fs = require("fs");
const ffmpeg = require("ffmpeg");
const WebSocket = require("ws");
const pth = require("path");
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

module.exports = function (wsAddress) {
    let ws = new WebSocket(wsAddress);

    ws.on("open", async () => {
        await extractImages();
        sendImages(ws);
        sendTemperatureAndHumidity(ws);
    });

    ws.on("error", function error(err) {
        console.error("WebSocket error:", err);
    });
};