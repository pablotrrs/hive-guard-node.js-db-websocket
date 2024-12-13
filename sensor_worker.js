const WebSocket = require('ws');
const cocoSsd = require('@tensorflow-models/coco-ssd');
const fluidb = require('fluidb');
const fs = require('fs');
const tf = require('@tensorflow/tfjs-node');
const MockModel = require('./test/mock-model');
const modelBeeAlarmed = tf.io.fileSystem("./test/model.json");
const {SensorWeatherData_Database} = require('./sensor_model');
const {SensorDetectionsData_Database} = require('./detections_model');
const sendEmail = require('./send_email.js');
require('dotenv').config();
const mongoose = require('mongoose');
const { Decimal128 } = require('bson');

let testMode = false;
let sensor_worker;
let command = null;
let validEntities = ['cat', 'dog', 'person', 'laptop', 'tv'];
let counter = 0;
let initialDataReceived;
let resolveInitialData;
let server;

initialDataReceived = new Promise((resolve) => {
  resolveInitialData = resolve;
});

fs.readdir('./images', { withFileTypes: true }, (err, files) => {
  if (err) {
    console.error(err);
    return;
  }

  validEntities = files.filter(file => file.isDirectory()).map(folder => folder.name);
});

process.on('uncaughtException', (error, origin) => {
  console.log('----- Uncaught exception -----');
  console.log(error);
  console.log('----- Exception origin -----');
  console.log(origin);
  console.log('----- Status -----');
  console.table(tf.memory());
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('----- Unhandled Rejection -----');
  console.log(promise);
  console.log('----- Reason -----');
  console.log(reason);
  console.log('----- Status -----');
  console.table(tf.memory());
});

process.on('message', (message) => {
  if (message.update === 'close') {
    server.close(() => {
      console.log('WebSocket server closed');
    });
  }

  if (message.update === 'sensor') {
    sensor_worker = message.data;
    console.log('Connection prepared for', sensor_worker.id);

    resolveInitialData();
  } else if (message.update === 'command') {
    command = message.data;
  }

  if (message.update === 'updatedEnvVars') {
    for (const key in message.data) {
      process.env[key] = message.data[key];
    }
  }
});

async function loadModel(testMode = false) {
  console.log("loadModel called");
  if (testMode) {
    console.log("Using MockModel");
    return new MockModel();
  }
  //return await cocoSsd.load();
  return await tf.loadLayersModel(modelBeeAlarmed);
}

function isTemperatureAndHumidityData(data) {
  const dataString = data.toString();
  const regex = /temp=\d+\.\d+,hum=\d+\.\d+,light=\d+;state:ON_BOARD_LED_1=\d/;
  return regex.test(dataString);
}

function isImage(data) {
  // TODO ver qué mierda más podemos hacer para probar que sea una imagen
  return typeof data === 'object'
}

async function detectObjects(img, model, ws) {
  if (sensor_worker.detectObjects) {
    counter++;

        if (counter == process.env.PREDICTION_FREQUENCY) {
            counter = 0;

      let imgTensor = tf.node.decodeImage(new Uint8Array(data), 3);
      imgTensor = imgTensor.expandDims(0);
      imgTensor = tf.image.resizeBilinear(imgTensor, [150, 75]);

      const predictions = await model.predict(imgTensor);
      /*
      predictions.forEach((prediction) => {
          console.log(prediction.class + ' - ' + prediction.score);
          if (validEntities.includes(prediction.class) && prediction.score > process.env.PREDICTION_SCORE_THRESHOLD) {
              console.log('****CCCCCCCCCCC');
              new fluidb(`./images/${prediction.class}/${Date.now()}`, { 'score': prediction.score, 'img': img, 'bbox': prediction.bbox });
          }
      });
      */
      listClasses = ["varroa", "pollen", "wasps", "cooling"];
      console.log('predictions ---: ' + predictions);
      for (let index = 0; index < predictions.length; index++) {
        let scoreTensor = predictions[index];
        let score = scoreTensor.dataSync()[0];
        score = score < 0.000001 ? 0 : score;
        console.log(listClasses[index] + ' - score: ' + score);
        //new fluidb(`./images/${listClasses[index]}/${Date.now()}`, { 'img': img});
      }


      tf.dispose([imgTensor]);
    }
  }
}

function getImageFromData(data) {
  return Buffer.from(Uint8Array.from(data)).toString('base64');
}

function getTemperatureFromData(data) {
  return data.toString().split(',')[0].split('=')[1];
}

function getHumidityFromData(data) {
  return data.toString().split(',')[1].split('=')[1];
}

function saveTempAndHumInDatabase(sensor, data) {
  const sensorData_ToBeSaved = {
    sensorId: sensor_worker.key
  };

  const readings = data.toString().split(',');

  for (const reading of readings) {
    const [key, value] = reading.split('=');

    // const numberValue = Number(value);
    // sensorData_ToBeSaved[key] = isNaN(numberValue) ? value : numberValue;
    sensorData_ToBeSaved[key] = parseFloat(value)
  }

  if (sensor.saveSensorData && !process.env.MONGO_ENABLED) {
      SensorWeatherData_Database.saveSensorData(sensorData_ToBeSaved);
  }
}

function saveDetectionsInDatabase(sensor, data) {
    if (sensor.saveSensorData && !process.env.MONGO_ENABLED) {
        SensorDetectionsData_Database.saveSensorData(data);
    }
}

function handleCommand(data) {
  const commandRegex = /\(c:(.*?)\)/g;
  let match;

  while ((match = commandRegex.exec(data))) {
    const keyValuePairs = match[1];
    const pairs = keyValuePairs.trim().split(/\s*,\s*/);

    for (const pair of pairs) {
      const [key, value] = pair.split("=");
      const commandFind = sensor_worker.commands.find(c => c.id === key);
      if (commandFind) {
        commandFind.state = value;
      }
    }
  }
}

function checkTempAndHumEnvVars() {
  if (!process.env.TEMP_MAX_THRESHOLD || !process.env.TEMP_MIN_THRESHOLD || !process.env.HUM_THRESHOLD) {
    throw new Error('You must set the TEMP_MAX_THRESHOLD, TEMP_MIN_THRESHOLD, and HUM_THRESHOLD environment variables\n' +
      'before sending an email. You can do this by sending a POST request to /api/config with the\n' +
      'following JSON payload: {"TEMP_MAX_THRESHOLD": " ", "TEMP_MIN_THRESHOLD": " ", "HUM_THRESHOLD": " "}.')
  }
}

function getAlertData(key, temperature, temp) {
  return {
    sensorId: key,
    alertType: temperature,
    value: temp
  }
}

function sendEmailIfTempAndHumAreCursed(sensor_worker) {
  checkTempAndHumEnvVars();

  if (sensor_worker.temp > process.env.TEMP_MAX_THRESHOLD) {
    process.send({ update: 'newAlert', data: getAlertData(sensor_worker.id, 'TEMP_MAX', sensor_worker.temp) });

    sendEmail('Temperature Alert', `Sensor ${sensor_worker.id} exceeded the temperature threshold. Temperature: ${sensor_worker.temp}`);
  }

  if (sensor_worker.temp < process.env.TEMP_MIN_THRESHOLD) {
    process.send({ update: 'newAlert', data: getAlertData(sensor_worker.id, 'TEMP_MIN', sensor_worker.temp) });

    sendEmail('Temperature Alert', `Sensor ${sensor_worker.id} is below the temperature threshold. Temperature: ${sensor_worker.temp}`);
  }

  if (sensor_worker.hum > process.env.HUM_THRESHOLD) {
    process.send({ update: 'newAlert', data: getAlertData(sensor_worker.id, 'HUM', sensor_worker.hum) });

    sendEmail('Humidity Alert', `Sensor ${sensor_worker.id} exceeded the humidity threshold. Humidity: ${sensor_worker.hum}`);
  }
}

async function main() {
  await initialDataReceived;

  // if (sensor.detectObjects) {
  const model = await loadModel(testMode);
  // }

  console.log('AI Model - ' + sensor_worker.detectObjects + ', Connection started for', sensor_worker.id);

  if (!sensor_worker) {
    process.exit();
  }

  server = new WebSocket.Server({ port: sensor_worker.wsPort }, () => console.log(`Master to Sensor WS Server is listening at ${sensor_worker.wsPort}`));
  process.send({ update: 'workerInitialized', data: sensor_worker });

  server.on('connection', (ws) => {
    console.log('A new WebSocket connection has been established between master and streamer ' + sensor_worker.id);

    ws.on('close', () => {
      console.log('A WebSocket connection has been closed between master and streamer ' + sensor_worker.id);
    });

    ws.on('error', (err) => {
      console.error('Error in WebSocket connection between master and streamer ' + sensor_worker.id, err);
    });

    ws.on('message', async (data) => {
      //console.log(data);
      if (ws.readyState !== ws.OPEN) return;

      if (command) {
        ws.send(command);
        command = null;
      }

      if (isTemperatureAndHumidityData(data)) {
        sensor_worker.temp = getTemperatureFromData(data);
        sensor_worker.hum = getHumidityFromData(data);

        sendEmailIfTempAndHumAreCursed(sensor_worker);
        saveTempAndHumInDatabase(sensor_worker, data);
      }

      if (typeof data === 'object') {
        let img = Buffer.from(Uint8Array.from(data)).toString('base64');

        if (sensor_worker.detectObjects) {
          counter++;

          if (counter == process.env.PREDICTION_FREQUENCY) {
            // console.log('****BBBBBBBBBBBB');
            counter = 0;

            let imgTensor = tf.node.decodeImage(new Uint8Array(data), 3);
            imgTensor = imgTensor.expandDims(0);
            imgTensor = tf.image.resizeBilinear(imgTensor, [150, 75]);

                        const predictions = await model.predict(imgTensor);
                        /*
                        predictions.forEach((prediction) => {
                            console.log(prediction.class + ' - ' + prediction.score);
                            if (validEntities.includes(prediction.class) && prediction.score > process.env.PREDICTION_SCORE_THRESHOLD) {
                                console.log('****CCCCCCCCCCC');
                                new fluidb(`./images/${prediction.class}/${Date.now()}`, { 'score': prediction.score, 'img': img, 'bbox': prediction.bbox });
                            }
                        });
                        */
                        listClasses = ["varroa","pollen","wasps","cooling"];
                        //console.log('predictions ---: ' + predictions);

                        for (let index = 0; index < predictions.length; index++) {
                            let dataToInsert = {
                                sensorId: sensor_worker.id,
                                varroa_score: 0,
                                pollen_score: 0,
                                wasps_score: 0,
                                cooling_score: 0
                            };

                            let scoreTensor = predictions[index];
                            let score = scoreTensor.dataSync()[0];
                            let theClass = listClasses[index];
                            score = score < 0.000001 ? 0 : score;
                            //console.log(theClass + ' - score: ' + score);
                            if (theClass === "varroa" && score !== 0) {
                                dataToInsert.varroa_score = Decimal128.fromString(score.toString());
                            }
                            if (theClass === "pollen" && score !== 0) {
                                dataToInsert.pollen_score = Decimal128.fromString(score.toString());
                            }
                            if (theClass === "wasps" && score >= 0.99999) {
                                dataToInsert.wasps_score = Decimal128.fromString(score.toString());
                            }
                            if (theClass === "cooling" && score >= 0.01) {
                                dataToInsert.cooling_score = Decimal128.fromString(score.toString());
                            }

                            if (dataToInsert.varroa_score !== 0 || dataToInsert.pollen_score !== 0 ||
                                dataToInsert.wasps_score !== 0 || dataToInsert.cooling_score !== 0
                            ) {
                                saveDetectionsInDatabase(sensor_worker, dataToInsert);
                            }
                        }

                        tf.dispose([imgTensor]);
                    }
                }

                sensor_worker.image = img;
            } else {
                const commandRegex = /\(c:(.*?)\)/g;
                const sensorRegex = /\(s:(.*?)\)/g;
                let match;

                while ((match = commandRegex.exec(data))) {
                    const keyValuePairs = match[1];
                    const pairs = keyValuePairs.trim().split(/\s*,\s*/);

                    for (const pair of pairs) {
                        const [key, value] = pair.split("=");
                        const commandFind = sensor_worker.commands.find(c => c.id === key);
                        if (commandFind) {
                            commandFind.state = value;
                        }
                    }
                }

                const sensorsObj = {
                    sensorId: sensor_worker.key
                };

                while ((match = sensorRegex.exec(data))) {
                    const keyValuePairs = match[1];
                    const pairs = keyValuePairs.trim().split(/\s*,\s*/);

                    for (const pair of pairs) {
                        const [key, value] = pair.split("=");
                        sensorsObj[key] = value;
                    }
                }

                if (sensor_worker.saveSensorData) {
                    Sensor.saveSensorData(sensorsObj);
                }

                sensor_worker.sensors = sensorsObj;
            }

            process.send({ update: 'sensor', data: sensor_worker });
        });
    });
}

main();

