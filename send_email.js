function sendEmail(subject, text) {
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