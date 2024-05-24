function checkEmailEnvVars() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.EMAIL_RECIPIENT) {
        throw new Error('You must set the EMAIL_USER, EMAIL_PASS, and EMAIL_RECIPIENT environment variables\n' +
            'before sending an email. You can do this by sending a POST request to /api/config with the\n' +
            'following JSON payload: {"EMAIL_USER": " ", "EMAIL_PASS": " ", "EMAIL_RECIPIENT": " "}.')
    }
}

function sendEmail(subject, text) {
    checkEmailEnvVars();

    let emailjs;

    import('emailjs').then((module) => {
        emailjs = module;
        const SMTPClient = emailjs.SMTPClient;

        const client = new SMTPClient({
            user: process.env.EMAIL_USER,
            password: process.env.EMAIL_PASS,
            host: 'smtp.gmail.com',
            ssl: true,
        });

        const message = {
            text: text,
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_RECIPIENT,
            subject: subject,
            // cc: 'bregolif.fb@gmail.com',
            // attachment: [
            //     { data: '<html>i <i>hope</i> this works!</html>', alternative: true },
            //     { path: 'path/to/file.zip', type: 'application/zip', name: 'renamed.zip' },
            // ],
        };

        client.send(message, function (err, message) {
            console.log(err || message);
        });
    });
}

module.exports = sendEmail;