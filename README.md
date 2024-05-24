![logo](./assets/hive-guard-logo.png)

Hive Guard is a real-time beekeeping monitor. It collects data, analyzes it, stores it, and presents it. It offers live video, environmental data, object detection, and more, making beekeeping modern and efficient.

![infrastructure](./assets/infrastructure.png)

# Hive Guard Master Server

#### Install:
1. Install [mongodb](https://www.mongodb.com/).
2. In your terminal, write:
```
npm install
```
3. To run the server, use:
```
npm run start
```

### Setting Parameters

Server parameters are:

- `TEMP_MIN_THRESHOLD`: The minimum temperature threshold for alerts.
- `TEMP_MAX_THRESHOLD`: The maximum temperature threshold for alerts.
- `HUM_THRESHOLD`: The humidity threshold for alerts.
- `EMAIL_USER`: The email address used for sending alert emails.
- `EMAIL_PASS`: The password for the email account used for sending alert emails.
- `EMAIL_RECIPIENT`: The recipient email address for alert emails.

You can set these parameters by sending a POST request to the `/api/set-env-vars` endpoint with the parameter values in the request body in JSON format. Here's an example of how to do this with cURL:

```bash
curl -X POST http://localhost:8000/api/set-env-vars \
-H "Content-Type: application/json" \
-d '{
    "TEMP_MIN_THRESHOLD": 25,
    "TEMP_MAX_THRESHOLD": 65,
    "HUM_THRESHOLD": 80,
    "EMAIL_USER": "user@example.com",
    "EMAIL_PASS": "password",
    "EMAIL_RECIPIENT": "recipient@example.com"
}'