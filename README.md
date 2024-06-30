![logo](./assets/hive-guard-logo.png)

Hive Guard is a real-time beekeeping monitor. It collects data, analyzes it, stores it, and presents it. It offers live video, environmental data, object detection, and more, making beekeeping modern and efficient.

![58c23b07-1d12-4e5a-b2c7-c42bce148e2a](https://github.com/pablotrrs/hive-guard-master-server/assets/66085255/ff3bbd20-05b9-47fd-b182-b3e021df6435)

This is part of the Hive Guard system, you can find a general overview [here](https://github.com/FrancoBre/HIVE-GUARD)

## Contents
1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [How to Use](#how-to-use)
   1. [Production Version](#production-version)
   2. [Mock Versions](#mock-versions)
   3. [Neural Network Analysis](#neural-network-analysis)

## Overview

This Node.js project sets up an HTTP server with the following endpoints, as well as a UDP server that listens for broadcast messages on a specified port to facilitate connections from streamers. Additionally, it connects to a MongoDB database where it inserts temperature, humidity data, and detection results.

The frontend then reads this database to generate graphs and visualizations. The images received are analyzed using a neural network algorithm developed by Fabián Hickert as part of his beeAlarmed project.

## API Endpoints

### Configuration

- **POST /api/config**
  - Description: Configure thresholds and email settings.
  - Request Body:
    ```json
    {
      "TEMP_MIN_THRESHOLD": 20,
      "TEMP_MAX_THRESHOLD": 60,
      "HUM_THRESHOLD": 80,
      "EMAIL_USER": "test",
      "EMAIL_PASS": "test",
      "EMAIL_RECIPIENT": "test"
    }
    ```
  - Headers: `Content-Type: application/json`

### Alerts

- **GET /api/alerts**
  - Description: Retrieve alerts.
  - No request body or headers required.

### Health Check

- **GET /api/healthcheck**
  - Description: Check server health.
  - No request body or headers required.

## How to Use

### Production Version

The production version is intended to be used within a local network to connect with streamers. Please refer to the streamers' documentation for more details.

To start the project, use:
```bash
docker-compose up
```

To connect with the frontend, navigate to:
[http://localhost:8000/client]

Here, you will be able to view images emitted by the streamers. To view the public URL, which is a tunnel created by ngrok, you need to create an account on ngrok and enter your auth token in the `.env` file and `ngrok.yaml`. Enter the public URL in the provided field on the deployed version page (URL). If this does not work, you can start the local version of the frontend as explained in [this documentation](https://github.com/EvolutionRX/hive-guard-client/blob/main/README.md).

### Mock Versions

You can also use mock versions to test the system without connecting streamers. We have developed logic to simulate the sending of images and temperature and humidity data from the ESP32 and DHT11 modules connected to a beehive.

To do this, place one of the available videos in the specified path and use ffmpeg to send each frame of the video as if they were recorded and streamed by a streamer.

We have two videos available:
1. One filmed by Fabián Hickert as part of his beeAlarmed project. Full videos [here](https://www.youtube.com/@raspbee-beealarmed8228)
![fabian-hickert-recording](./assets/fabian-hickert-hive-recording.gif)

3. Another filmed by Jorge Seniw, our beekeeper contact, using an ESP32CAM. Full video [here]()
![jorge-seniw-recording](./assets/jorge-seniw-hive-recording.gif)

The video filmed by Jorge Seniw is more realistic in this context, because the whole system is ESP32CAM based.
You can also test your own videos recorded with an ESP32CAM or another device. We used [this software](https://github.com/jameszah/ESP32-CAM-Video-Recorder-junior) by jameszah to record images into an SD card.

Run the mock version by running:
```bash
docker-compose -f docker-compose.mock.yml up
```

You can also run a local version, which does not run in a docker network by running:
```bash
npm install
npm run start-all
```

Or if this doesn't work for you (check the [troubleshooting section](https://github.com/FrancoBre/HIVE-GUARD#troubleshooting) first), you can try running:
```bash
npm install
npm run start
npm run start-streamer1
npm run start-streamer2
```

### Neural Network Analysis

The neural network used to analyze the images for identifying incoming and outgoing bees, bees with varroa, bees with pollen, etc., was developed by Fabián Hickert using his images. We still need to test the accuracy of the predictions on our images and determine if any adjustments to the model are necessary.

### What is left to do

There is a version that sends battery in [this branch](https://github.com/pablotrrs/hive-guard-master-server/tree/feature/send-battery-again). Check [here](https://github.com/FrancoBre/HIVE-GUARD#Battery) for more insight
