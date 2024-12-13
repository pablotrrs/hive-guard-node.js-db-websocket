if (process.env.MONGO_ENABLED !== 'true') {
  console.log('MongoDB not enabled');
  module.exports = {};
  return;
}

const { mongoose, setupDatabaseConnection } = require('./config/mongoose_config');
setupDatabaseConnection();

const sensorSchema = new mongoose.Schema({
  sensorId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  // Add other sensor values as needed
  temp: Number,
  hum: Number,
});

sensorSchema.statics.getAllSensorsData = async function() {
  if (process.env.MONGO_ENABLED !== 'true') {
    return [];
  }
  try {
    const sensors = await this.find({}).exec();
    return sensors;
  } catch (err) {
    console.error(`Error getting sensors: ${err}`);
    throw err;
  }
};

sensorSchema.statics.getAllSensorIDs = async function() {
  if (process.env.MONGO_ENABLED !== 'true') {
    return [];
  }
  try {
    const sensorIDAggregation = [
      {
        $group: {
          _id: '$sensorId'
        }
      },
      {
        $project: {
          _id: 0,
          sensorId: '$_id'
        }
      }
    ];

    const sensorIDs = await this.aggregate(sensorIDAggregation).exec();
    return sensorIDs;
  } catch (err) {
    console.error(`Error getting sensorIDs: ${err}`);
    throw err;
  }
};

sensorSchema.statics.getSensorDataById = async function(sensorId) {
  if (process.env.MONGO_ENABLED !== 'true') {
    return [];
  }
  try {
    const sensorData = await this.find({ sensorId }).exec();
    return sensorData;
  } catch (err) {
    console.error(`Error getting sensor data for sensorId "${sensorId}": ${err}`);
    throw err;
  }
};

sensorSchema.statics.getSensorDataByIdBetweenTimestamps = async function(sensorId, startTime, endTime) {
  if (process.env.MONGO_ENABLED !== 'true') {
    return [];
  }
  try {
    const sensorData = await this.find({
      sensorId,
      timestamp: {
        $gte: new Date(startTime),
        $lte: new Date(endTime),
      },
    }).exec();
    return sensorData;
  } catch (err) {
    console.error(`Error getting sensor data for sensorId "${sensorId}" between timestamps: ${err}`);
    throw err;
  }
};

sensorSchema.statics.saveSensorData = function(sensorsObj) {
  if (process.env.MONGO_ENABLED !== 'true') {
    return Promise.resolve(true);
  }
  this.create(sensorsObj)
    .then(() => {
      console.debug(`Sensor data saved successfully: ${JSON.stringify(sensorsObj)}`);
    })
    .catch((err) => {
      console.error(`Error saving sensor data: ${err}`);
      throw err;
    });

  return Promise.resolve(true);
};

const SensorWeatherData_Database = mongoose.model('Sensor', sensorSchema);

module.exports = {
    mongoose,
    SensorWeatherData_Database: SensorWeatherData_Database
};
