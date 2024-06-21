const mongoose = require('mongoose');
const { Decimal128 } = require('bson');

const sensorSchema = new mongoose.Schema({
    sensorId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    varroa_score: { type: Decimal128 },
    pollen_score: { type: Decimal128 },
    wasps_score: { type: Decimal128 },
    cooling_score: { type: Decimal128 }
});

sensorSchema.statics.getAllSensorsData = async function () {
    try {
        const sensors = await this.find({}).exec();
        return sensors;
    } catch (err) {
        console.error(`Error getting sensors: ${err}`);
        throw err;
    }
};

sensorSchema.statics.getAllSensorIDs = async function () {
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

sensorSchema.statics.getSensorDataById = async function (sensorId) {
    try {
        const sensorData = await this.find({ sensorId }).exec();
        return sensorData;
    } catch (err) {
        console.error(`Error getting sensor data for sensorId "${sensorId}": ${err}`);
        throw err;
    }
};

sensorSchema.statics.getSensorDataByIdBetweenTimestamps = async function (sensorId, startTime, endTime) {
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

sensorSchema.statics.saveSensorData = function (sensorsObj) {
    console.log('****asd: ' + sensorsObj);
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

const SensorDetectionsData_Database = mongoose.model('SensorDetections', sensorSchema);

module.exports = {
    mongoose,
    SensorDetectionsData_Database: SensorDetectionsData_Database
};
