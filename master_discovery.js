// this file has the master - esp32 streamer discovery logic
const http = require("http");

exports.isMaster = (_req, res) => {
    console.log("received request");
    res.setHeader('Master', 'Yes');
    res.status(200).send('Master server\r');
    var ipAddress = _req.headers['x-forwarded-for'] || _req.connection.remoteAddress;

    if (ipAddress.substr(0, 7) == "::ffff:") {
        ipAddress = ipAddress.substr(7)
    }
    console.log("ESP32 making the request IP address is: " + ipAddress);

    const clientIp = process.env.CLIENT_SERVER_IP;
    let json = JSON.stringify({ clientIp: clientIp });

    const post_options = {
        hostname: ipAddress,
        port: process.env.ESP32_STREAMERS_PORT,
        method: "POST",
        path: "/iAmMaster",
        headers: {
            "Content-Type": "application/json"
        }
    }

    const post_request = http.request(post_options);

    post_request.write(json)
    post_request.end();
};