const WebSocket = require('ws');
const cocoSsd = require('@tensorflow-models/coco-ssd');
const fluidb = require('fluidb');
const fs = require('fs');
const tf = require('@tensorflow/tfjs-node');
const MockModel = require('./test/mock-model');
const modelBeeAlarmed = tf.io.fileSystem("./test/model.json");
const { Sensor } = require('./sensor-model');
require('dotenv').config();

let testMode = false;
let sensor;
let command = null;
let validEntities = ['cat', 'dog', 'person', 'laptop', 'tv'];
let counter = 0;
let initialDataReceived;
let resolveInitialData;

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
	if (message.update === 'sensor') {
		sensor = message.data;
		console.log('Connection prepared for', sensor.key);
		
		resolveInitialData();
	} else if (message.update === 'command') {
		command = message.data;
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

async function main() {
	await initialDataReceived;
	
	// if (sensor.detectObjects) {
		const model = await loadModel(testMode);
	// }

	console.log('AI Model - ' + sensor.detectObjects + ', Connection started for', sensor.key);

	if (!sensor) {
		process.exit();
	}
	
	const server = new WebSocket.Server({ port: sensor.port }, () => console.log(`WS Server is listening at ${sensor.port}`));
	server.on('connection', (ws) => {
		ws.on('message', async (data) => {
			//console.log(data);
			if (ws.readyState !== ws.OPEN) return;
			
			if (command) {
				ws.send(command);
				command = null;
			}
			
			if (typeof data === 'object') {
				let img = Buffer.from(Uint8Array.from(data)).toString('base64');

				if (sensor.detectObjects) {
					counter++;

					if (counter == process.env.PREDICTION_FREQUENCY) {
						console.log('****BBBBBBBBBBBB');
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

				sensor.image = img;
			} else {
				const commandRegex = /\(c:(.*?)\)/g;
				const sensorRegex = /\(s:(.*?)\)/g;
				let match;
				
				while ((match = commandRegex.exec(data))) {
					const keyValuePairs = match[1];
					const pairs = keyValuePairs.trim().split(/\s*,\s*/);
					
					for (const pair of pairs) {
						const [key, value] = pair.split("=");
						const commandFind = sensor.commands.find(c => c.id === key);
						if (commandFind) {
							commandFind.state = value;
						}
					}
				}

				const sensorsObj = {
					sensorId: sensor.key
				};

				while ((match = sensorRegex.exec(data))) {
					const keyValuePairs = match[1];
					const pairs = keyValuePairs.trim().split(/\s*,\s*/);
					
					for (const pair of pairs) {
						const [key, value] = pair.split("=");
						sensorsObj[key] = value;
					}
				}

				if (sensor.saveSensorData) {
					Sensor.saveSensorData(sensorsObj);
				}

				sensor.sensors = sensorsObj;
			}
			
			process.send({ update: 'sensor', data: sensor });
		});
	});
}

main();

