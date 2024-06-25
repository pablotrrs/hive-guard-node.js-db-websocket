const axios = require('axios');

const waitForServer = async () => {
  const url = 'http://localhost:8000/client';
  let maxAttempts = 10;
  let waitTime = 1000;

  while (maxAttempts > 0) {
    try {
      await axios.head(url);
      return;
    } catch (error) {
      maxAttempts--;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  console.error(`Couldn't check connection with master server, try running master and mock servers sequentially by doing:`);
  console.error(`npm run start then npm run start-streamer1, and finally npm run start-streamer2`);
  process.exit(1);
};

waitForServer();
