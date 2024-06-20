const { exec } = require('child_process');
const connectWithMaster_AndSendDataOver = require('./send_image_temp_hum').connectWithMaster_AndSendDataOver;

if (process.env.IS_DOCKER_COMPOSE === 'true') {
  console.log('Mock sensor data streamer 1 running in docker-compose mode')
  exec('nslookup server', (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`nslookup output: ${stdout}`);
    const ip = stdout.split('\n').filter(line => line.trim().startsWith('Address:')).pop().split(' ')[1];
    console.log(`IP of the master server: ${ip}`);
    console.log('Starting mock sensor data streamer 2');
    connectWithMaster_AndSendDataOver(process.env.WS_PORT, process.env.CLIENT_HTTP_PORT, process.env.CLIENT_UDP_PORT)
  });
} else {
  const ip = '127.0.0.1';
  const wsPort = 8001;
  const appPort = 9001;
  const udpPort = 123456;
  console.log(`IP of the master server: ${ip}`);
  console.log('Starting mock sensor data streamer 2');
  connectWithMaster_AndSendDataOver(wsPort, appPort, udpPort)
}
