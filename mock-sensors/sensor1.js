const connectWithMaster_AndSendDataOver = require('./send_image_temp_hum').connectWithMaster_AndSendDataOver;

console.log('Starting mock sensor data streamer 1');
connectWithMaster_AndSendDataOver('127.0.0.1', '8001', '9001')