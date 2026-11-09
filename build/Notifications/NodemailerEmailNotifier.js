"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodemailerEmailNotifier = void 0;
const Notifier_1 = require("./Notifier");
class NodemailerEmailNotifier extends Notifier_1.Notifier {
    client;
    constructor(transporter, channel, sender, templates = [], vars = {}) {
        super(channel, sender, templates, vars);
        this.client = transporter;
    }
    async notify(receiver, template, data) {
        const messageContent = await this.render(template, data);
        const mailOptions = {
            to: receiver,
            from: this.sender,
            subject: this.vars.subject ?? 'Verification Code',
            html: messageContent,
        };
        try {
            const info = await this.client.sendMail(mailOptions);
            console.debug('Message sent successfully using Nodemailer:', info.messageId);
        }
        catch (err) {
            console.error('Error sending email using Nodemailer:', err);
        }
    }
}
exports.NodemailerEmailNotifier = NodemailerEmailNotifier;
