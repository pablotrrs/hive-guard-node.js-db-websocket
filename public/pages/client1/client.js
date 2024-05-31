const clientIp = window.env.CLIENT_SERVER_IP;
const wsWithServer = new WebSocket(`ws://${clientIp}:${window.env.CLIENT_WS_PORT}`);

let allDevices = new Map();

wsWithServer.addEventListener('open', (event) => {
    wsWithServer.send(JSON.stringify({
        'client': '8999',
        'operation': 'connecting',
        'data': {}
    }));
});

document.addEventListener('DOMContentLoaded', (event) => {
    let mainWrapper = document.querySelector('#main-wrapper');
    let serverInfo = createElement('div', {class: 'server-info'});
    serverInfo.appendChild(createElement('h2', {}, 'Master server, ip:' + clientIp));
    let details = createElement('details', {});
    details.appendChild(createElement('summary', {}, 'Connected streamers: ' + allDevices.size));
    serverInfo.appendChild(details);
    mainWrapper.insertBefore(serverInfo, mainWrapper.firstChild);
});

window.onload = function() {

    let serverInfo = createElement('div', {class: 'server-info'});
    serverInfo.appendChild(createElement('h2', {}, 'Master server, ip:' + clientIp));
    // no anda lo de la tab no se por que
    let details = createElement('details', {});
    details.appendChild(createElement('summary', {}, 'Connected streamers: ' + allDevices.size));
};

wsWithServer.onmessage = message => {
    let md = JSON.parse(message.data);
    let incomingData = md.devices[0];
    console.log('incomingData', incomingData);
    console.log('allDevices', Array.from(allDevices));

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
        document.querySelector('#main-wrapper').appendChild(deviceElement);
        deviceElement.appendChild(createElement('h2', {
            id: device.id + '-header',
            class: 'sensors-header'
        }, device.display));
        if (device.class === 'cam-instance') {
            let imageWrapper = createElement('div', {id: 'wrap-' + device.id + '-image', class: 'image-wrapper'});
            deviceElement.appendChild(imageWrapper);
            imageWrapper.appendChild(createElement('img', {id: 'img-' + device.id}));
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
    }
}

function updateDeviceBox(device, incomingData) {
    if (incomingData.image) {
        document.querySelector('#img-' + device.id).src = "data:image/jpeg;base64," + incomingData.image;
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