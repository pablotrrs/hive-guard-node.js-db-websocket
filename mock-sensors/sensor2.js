const setupWebSocket = require('./send_image_temp_hum');

console.log('Starting mock sensor data streamer 2');
setupWebSocket(`ws://127.0.0.1:8003`);