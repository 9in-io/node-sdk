"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailgunEmailNotifier = void 0;
const _1 = require(".");
const Notifier_1 = require("./Notifier");
class MailgunEmailNotifier extends Notifier_1.Notifier {
    client;
    domain;
    constructor(mailgun, domain, sender, templates = [], vars = {}) {
        super(_1.Notifications.Channel.EMAIL, sender, templates, vars);
        this.client = mailgun;
        this.domain = domain;
    }
    async notify(receiver, template, data) {
        const messageContent = await this.render(template, data);
        const messageData = {
            from: this.sender,
            to: receiver,
            subject: this.vars.subject ?? 'Verification Code',
            html: messageContent,
        };
        try {
            const response = await this.client.messages.create(this.domain, messageData);
            console.log('Email sent successfully using Mailgun:', response);
        }
        catch (error) {
            console.error('Error sending email using Mailgun:', error);
        }
    }
}
exports.MailgunEmailNotifier = MailgunEmailNotifier;
