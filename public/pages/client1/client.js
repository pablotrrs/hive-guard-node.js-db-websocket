const local_MasterIp = window.env.MASTER_SERVER_LOCAL_IP;
const public_MasterIp = window.env.MASTER_SERVER_PUBLIC_IP;
const port = window.env.CLIENT_WS_PORT;
let wsWithMaster;
var beesIn = 0;
var beesOut = 0;
var beeTracker = {
	beeIdCounter: 0,
	bees: {}
};

function connectWebSocket() {
    if (typeof cv === 'undefined') {
		loadOpenCvScript();
	}

    wsWithMaster = new WebSocket(`ws://${local_MasterIp}:${port}`);

    wsWithMaster.addEventListener('open', (event) => {
        wsWithMaster.send(JSON.stringify({
            'client': '8999',
            'operation': 'connecting',
            'data': {}
        }));
    });

    wsWithMaster.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        setTimeout(connectWebSocket, 5000);
    });
}

connectWebSocket();

function loadOpenCvScript() {
	return new Promise((resolve, reject) => {
		// Verificar si OpenCV ya está cargado
		if (typeof cv !== 'undefined') {
			console.log('OpenCV already loaded 1');
			resolve('OpenCV already loaded');
			return;
		}

		// Crear el script de OpenCV.js dinámicamente
		const script = document.createElement('script');
		script.async = true;
		script.src = "https://docs.opencv.org/4.x/opencv.js";

		// Configurar la función de resolución de la promesa
		script.onload = () => {
			console.log('OpenCV already loaded 2');
			cv['onRuntimeInitialized'] = () => {
				resolve('OpenCV loaded successfully');
			};
		};

		// Configurar la función de rechazo de la promesa
		script.onerror = (error) => reject(`Error loading OpenCV: ${error}`);

		// Añadir el script al documento
		document.head.appendChild(script);
	});
}

let allDevices = new Map();

document.addEventListener('DOMContentLoaded', (event) => {
    let mainWrapper = document.querySelector('#main-wrapper');
    let serverInfo = createElement('div', {class: 'server-info'});

    if(public_MasterIp) {
        let publicIpTitle = createElement('h2', {}, 'Master server public url:');
        serverInfo.appendChild(publicIpTitle);
        let publicIpValue = createElement('div', {class: 'ip-value'}, public_MasterIp);
        serverInfo.appendChild(publicIpValue);
        let copyButton = createElement('button', {class: 'copy-button'});
        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(public_MasterIp);
        });
        serverInfo.appendChild(copyButton);
    }

    let localIpTitle = createElement('h2', {}, 'Master server local ip:');
    serverInfo.appendChild(localIpTitle);
    let localIpValue = createElement('div', {class: 'ip-value'}, local_MasterIp);
    serverInfo.appendChild(localIpValue);
    let copyButton = createElement('button', {class: 'copy-button'});
    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(local_MasterIp);
    });
    serverInfo.appendChild(copyButton);

    let details = createElement('details', {});
    details.appendChild(createElement('summary', {}, 'Connected streamers: ' + allDevices.size));
    serverInfo.appendChild(details);
    mainWrapper.insertBefore(serverInfo, mainWrapper.firstChild);
});

window.onload = function () {

    let serverInfo = createElement('div', {class: 'server-info'});
    serverInfo.appendChild(createElement('h2', {}, 'Master server, ip:' + masterIp));
    // no anda lo de la tab no se por que
    let details = createElement('details', {});
    details.appendChild(createElement('summary', {}, 'Connected streamers: ' + allDevices.size));
};

wsWithMaster.onmessage = message => {
    let md = JSON.parse(message.data);
    let incomingData = md.devices[0];
    // console.log('incomingData', incomingData);
    // console.log('allDevices', Array.from(allDevices));

    // if md.devices.id is not in devices, add it
    if (!allDevices.has(incomingData.id)) {
        let device = {
            id: incomingData.id,
            class: incomingData.class,
            display: incomingData.display,
            port: incomingData.port
        }
        allDevices.set(device.id, device);
        createDeviceBox(device);
    }

    allDevices.forEach(device => {
        updateDeviceBox(device, incomingData);
    });

    let detailsSummary = document.querySelector('.server-info details summary');
    detailsSummary.innerHTML = 'Connected streamers: ' + allDevices.size;
    // let details = document.querySelector('.server-info details');
    // let devicesData = '';
    // allDevices.forEach(device => {
    //     devicesData += `Device ID: ${device.id}, Class: ${device.class}, Display: ${device.display}, Port: ${device.port}<br>`;
    // });
    // details.innerHTML = devicesData
}

function createDeviceBox(device) {
    let deviceElement = document.querySelector('#' + device.id);
    if (!deviceElement) {
        deviceElement = createElement('div', {id: device.id, class: device.class + ' item'});
        deviceElement2 = createElement('div', {id: device.id + '2', class: device.class + ' item'});
        document.querySelector('#main-wrapper').appendChild(deviceElement);
        document.querySelector('#main-wrapper').appendChild(deviceElement2);
        deviceElement.appendChild(createElement('h2', {
            id: device.id + '-header',
            class: 'sensors-header'
        }, device.display));
        if (device.class === 'cam-instance') {
            let imageWrapper = createElement('div', {id: 'wrap-' + device.id + '-image', class: 'image-wrapper'});
            deviceElement.appendChild(imageWrapper);
            // imageWrapper.appendChild(createElement('img', {id: 'img-' + device.id}));
            
            imageWrapper.appendChild(createElement('canvas', {
                id: device.id + '-canvas',
                class: 'sensor-canvas'
            }));
        }
        deviceElement.appendChild(createElement('div', {
            id: 'wrap-' + device.id + '-sensors',
            class: 'sensors-wrapper-overlay'
        }));
        deviceElement.appendChild(createElement('div', {
            id: 'wrap-' + device.id + '-commands',
            class: 'commands-wrapper-overlay'
        }));
        deviceElement.appendChild(createElement('div', {
            id: device.id + '-temp',
            class: 'sensor sensor-temp'
        }, '0 '));

        deviceElement.appendChild(createElement('div', {
            id: device.id + '-hum',
            class: 'sensor sensor-hum'
        }, '0 '));

        // deviceElement2.appendChild(createElement('canvas', {
        //     id: device.id + '-filteredCanvas',
        //     class: 'sensor sensor-filteredCanvas'
        // }, '0 '));
    }
}

function updateDeviceBox(device, incomingData) {
    if (incomingData.image) {
        // document.querySelector('#img-' + device.id).src = "data:image/jpeg;base64," + incomingData.image;
        detections(device.id, "data:image/jpeg;base64," + incomingData.image);
    }
    // if ('temp' in incomingData) {
    if (incomingData.temp) {
        document.querySelector('#' + device.id + '-temp').innerHTML = incomingData.temp + ' ';
    }
    if (incomingData.hum) {
        document.querySelector('#' + device.id + '-hum').innerHTML = incomingData.hum + ' ';
    }

    try {
        for (const [key, value] of Object.entries(incomingData.sensors)) {
            if (!document.querySelector('#' + device.id + '-' + key)) {
                document.querySelector('#wrap-' + device.id + '-sensors')
                    .appendChild(createElement('div', {
                        id: device.id + '-' + key.toLowerCase(),
                        class: 'sensor sensor-' + key.toLowerCase()
                    }));
            }

            document.querySelector('#' + device.id + '-' + key.toLowerCase()).innerHTML = value;
        }

    } catch (error) {
    }
}

function detections(theId, theImage) {
	let canvas = document.getElementById(theId + '-canvas');
	// let filteredCanvas = document.getElementById(theId + '-filteredCanvas');
	let ctx = canvas.getContext('2d');

	let src, hsv, greenChannel, diff, blurred, normalized, inverted, thresholded;

	let base64Image = new Image();;
	base64Image.src = theImage;

	base64Image.onload = () => {
		// Set canvas dimensions to the image dimensions
		canvas.width = 200;
		canvas.height = 200;
		// filteredCanvas.width = 200;
		// filteredCanvas.height = 200;

		// Draw the image on the canvas
		ctx.drawImage(base64Image, 0, 0, 200, 200);

		// Initialize OpenCV mats
		src = new cv.Mat(200, 200, cv.CV_8UC4);
		hsv = new cv.Mat(200, 200, cv.CV_8UC3);
		greenChannel = new cv.Mat(200, 200, cv.CV_8UC1);
		diff = new cv.Mat(200, 200, cv.CV_8UC1);
		blurred = new cv.Mat(200, 200, cv.CV_8UC1);
		normalized = new cv.Mat(200, 200, cv.CV_8UC1);
		inverted = new cv.Mat(200, 200, cv.CV_8UC1);
		thresholded = new cv.Mat(200, 200, cv.CV_8UC1);

		// Process the image
		processImage();
	};

	function processImage() {
		// Capture the frame from the canvas
		src.data.set(ctx.getImageData(0, 0, 200, 200).data);

		// Convert to HSV (using constant value)
		cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
		cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV); // Convert to HSV from RGB

		// Extract the V channel (brightness) and the Green channel from RGB
		let channels = new cv.MatVector();
		cv.split(hsv, channels);
		let vChannel = channels.get(2); // V channel
		cv.split(src, channels);
		let gChannel = channels.get(1); // Green channel

		// Crear una matriz con el valor constante (en este caso, 0.5)
		let scaleFactor = new cv.Mat(vChannel.rows, vChannel.cols, vChannel.type(), new cv.Scalar(0.5));

		// Multiplicar el canal verde por el factor de escala
		cv.multiply(gChannel, scaleFactor, gChannel);

		// Liberar la matriz de factor de escala después de su uso
		scaleFactor.delete();

		// Restar el canal verde modificado del canal V
		cv.subtract(vChannel, gChannel, diff);

		// Apply threshold to get a binary image
		cv.threshold(diff, thresholded, 127, 255, cv.THRESH_BINARY);

		// Normalize the image to make the contrast higher
		cv.normalize(thresholded, normalized, 0, 255, cv.NORM_MINMAX);

		// Invert the colors so bees are black and background is white
		cv.bitwise_not(normalized, inverted);

		// Apply Gaussian blur
		cv.GaussianBlur(inverted, blurred, new cv.Size(23, 23), 0, 0, cv.BORDER_DEFAULT);

		// Apply threshold to get a binary image
		cv.threshold(blurred, thresholded, 127, 255, cv.THRESH_BINARY);

		// Find contours (objects in motion)
		let contours = new cv.MatVector();
		let hierarchy = new cv.Mat();
		cv.findContours(thresholded, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

		// Distance from the top and bottom to consider crossing the boundary
		let distance = 4;

		// Draw contours and track movement
		for (let i = 0; i < contours.size(); i++) {
			try {
				let cnt = contours.get(i);
				let rect = cv.boundingRect(cnt);
		
				if (rect.width > 5 && rect.height > 5 && rect.width < 20 && rect.height < 50) { // filter by size
					// Calculate the center of the rectangle
					let centerX = rect.x + rect.width / 2;
					let centerY = rect.y + rect.height / 2;
		
					// Define the axes lengths of the ellipse
					let axisLengthX = rect.width / 2;
					let axisLengthY = rect.height / 2;
		
					let beeDetected = false;
					let beeColor, beeName;
		
					// Check if this bee is already being tracked
					for (let id in beeTracker.bees) {
						let bee = beeTracker.bees[id];
						if (Math.abs(bee.x - centerX) < 50 && Math.abs(bee.y - centerY) < 50) {
							// Update bee position
							beeTracker.bees[id] = { ...bee, x: centerX, y: centerY, frames: 0 };
							beeDetected = true;
							beeColor = bee.color;
							beeName = bee.name;

							// Check for entry or exit
							if (centerY > 200 - distance && bee.y <= 200 - distance) {
								beesIn++;
								// console.log(`Abeja ${id} entrando`);
								delete beeTracker.bees[id]; // Eliminar la abeja del seguimiento
								console.log('****beesOut: ' + beesOut);
							} else if (centerY < distance && bee.y >= distance) {
								beesOut++;
								// console.log(`Abeja ${id} saliendo`);
								delete beeTracker.bees[id]; // Eliminar la abeja del seguimiento
								console.log('****beesIn: ' + beesIn);
							}
							break;
						}
					}
		
					if (!beeDetected) {
						// New bee detected
						beeColor = new cv.Scalar(255, 0, 0, 255);
						beeName = '';
						beeTracker.bees[beeTracker.beeIdCounter] = { x: centerX, y: centerY, frames: 0, color: beeColor, name: beeName };
						beeTracker.beeIdCounter++;
					}
		
					// Draw the ellipse
					cv.ellipse(src, new cv.Point(centerX, centerY), new cv.Size(axisLengthX, axisLengthY), 0, 0, 360, beeColor, 2);
		
					// Draw the name near the ellipse
					cv.putText(src, beeName, new cv.Point(centerX - axisLengthX, centerY - axisLengthY - 10), cv.FONT_HERSHEY_TRIPLEX, 0.7, beeColor, 1);
				}
			} catch (error) {
				console.error("Error al ajustar la elipse:", error);
			}
		}

		// Update bee tracking data
		for (let id in beeTracker.bees) {
			beeTracker.bees[id].frames++;
			// Remove bees that have been invisible for too long
			if (beeTracker.bees[id].frames > 30) {
				delete beeTracker.bees[id];
			}
		}

		// Draw the entry and exit lines
		// cv.line(src, new cv.Point(0, 200 - distance), new cv.Point(src.cols, 200 - distance), new cv.Scalar(255, 255, 255, 255), 2);
		// cv.line(src, new cv.Point(0, distance), new cv.Point(src.cols, distance), new cv.Scalar(255, 255, 255, 255), 2);

		// Show the filtered result
		// cv.imshow(theId + '-filteredCanvas', thresholded);

		// Show the original video frame for comparison
		cv.imshow(theId + '-canvas', src);

		// Cleanup
		channels.delete();
	}

	function getRandomColor() {
		// Generar valores aleatorios para los canales rojo, verde y azul
		let r = Math.floor(Math.random() * 256);
		let g = Math.floor(Math.random() * 256);
		let b = Math.floor(Math.random() * 256);
		return new cv.Scalar(r, g, b, 255); // Retorna un color en formato Scalar con opacidad completa
	}

	function getRandomName() {
		const names = ["Lara", "Luisina", "Valentin", "Kevin", "Paola", "Dante", "Axel", "Sol", "Rocio", "Gaspar", "Magdalena", "Justina", "Sofia", "Simon", "Candela", "Ignacio", "Agustin", "Ivan", "Laura", "Nicole", "Sebastian", "Leonardo", "Carmen", "Antonio", "Yago", "Eliana", "Victoria", "Macarena", "Pilar", "Renata", "Ramona", "Isabel", "Martina", "Delfina", "Joaquin", "Carolina", "Luciano", "Tatiana", "Carlos", "Felipe", "David", "Maria", "Gabriel", "Franco", "Sara", "Agustina", "Esteban", "Aaron", "Martin", "Alejandro", "Daniela", "Paloma", "Violeta", "Gabriela", "Sonia", "Fernando", "Manuela", "Aitana", "Ignacia", "Sabrina", "Lautaro", "Patricia", "Monica", "Rafael", "Barbara", "Mariana", "Eugenia", "Marcela", "Mateo", "Cecilia", "Julieta", "Santiago", "Enzo", "Lourdes", "Camila", "Clara", "Susana", "Bruno", "Ramiro", "Cristian", "Andres", "Francisco", "Pedro", "Monica", "Cesar", "Julieta", "Thiago", "Tomas", "Valeria", "Jeronimo", "Beatriz", "Daniel", "Milagros", "Andrea", "Pablo", "Benjamin", "Naiara", "Axel", "Florencia", "Brenda", "Alejandro", "Manuel", "Nicolas", "Emanuel", "Amparo", "Dolores", "Malena", "Gabriela", "Ramiro", "Gonzalo", "Lucas", "Sara", "Catalina", "Javier", "Julian", "Agustina", "Yamila", "Elena", "Carla", "Samira", "Jazmin", "Eva", "Juan", "Lucia", "Gisela", "Clara", "Irene", "Jose", "Diego", "Ivan", "Belen", "Gonzalo", "Hugo", "Nicole", "Eduardo", "Renata", "Sofia", "Zoe", "Nadia", "Justina", "Melina", "Leandro", "Federico", "Antonio", "Gabriel", "Luis", "Josefina", "Luis", "Victoria", "Nora", "Candela", "Ana", "Ignacia", "Laura", "Monica", "Esteban", "Jorge", "Tamara", "Carla", "Salma", "Tatiana", "Marcos", "Carmen", "Bruno", "Omar", "Gustavo", "Leonardo"];
		return names[Math.floor(Math.random() * names.length)];
	}
}