const mongoose = require('mongoose');
const { exec } = require('child_process');
require('dotenv').config();

mongoose.set('debug', false);

const connectToDatabase = (uri) => {
    mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: process.env.MONGODB_MAX_POOL,
        serverSelectionTimeoutMS: 10000
    }).then(() => {
        console.log('Mongoose connected to MongoDB');
    }).catch((err) => {
        console.log('Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
        console.log('Mongoose disconnected from MongoDB');
    });
};

const setupDatabaseConnection = () => {
  if (process.env.MONGO_ENABLED !== 'true') {
    console.log('MongoDB not enabled. Skipping connection setup.');
    return;
  }

  if (process.env.IS_DOCKER_COMPOSE === 'true') {
    console.log('Server running in docker-compose mode');
    exec('nslookup db', (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
      console.log(`nslookup output: ${stdout}`);
      const ip = stdout.split('\n').filter(line => line.trim().startsWith('Address:')).pop().split(' ')[1];
      console.log(`Database IP is: ${ip}`);
      process.env.MONGODB_IP = ip;

      const uri = `mongodb://${process.env.MONGODB_IP}:${process.env.MONGODB_PORT}/${process.env.MONGODB_NAME}`;
      console.log(`Connecting to MongoDB at ${uri}`);
      connectToDatabase(uri);
    });
  // TODO separar bien por ambientes
  // } else if (process.env.NODE_ENV === 'live'){
  } else {
    const uri = `mongodb://${process.env.MONGODB_IP}:${process.env.MONGODB_PORT}/${process.env.MONGODB_NAME}`;
    // const uri = `mongodb+srv://ptorres:SPq5PuGgw3QpwaYf@hive-guard-p.vr9tc8v.mongodb.net/`;
    console.log(`Connecting to MongoDB at ${uri}`);
    connectToDatabase(uri);
  }
};

module.exports = {
  mongoose,
  setupDatabaseConnection
};
