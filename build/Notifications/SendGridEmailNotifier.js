"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendGridEmailNotifier = void 0;
const _1 = require(".");
const Notifier_1 = require("./Notifier");
class SendGridEmailNotifier extends Notifier_1.Notifier {
    client;
    constructor(sgMailInstance, sender, templates = [], vars = {}) {
        super(_1.Notifications.Channel.EMAIL, sender, templates, vars);
        this.client = sgMailInstance;
    }
    async notify(receiver, template, data) {
        const messageContent = await this.render(template, data);
        const msg = {
            to: receiver,
            from: this.sender,
            subject: this.vars.subject ?? 'Verification Code',
            html: messageContent,
        };
        try {
            await this.client.send(msg);
            console.debug('Email sent successfully using SendGrid');
        }
        catch (error) {
            console.error('Error sending email using SendGrid:', error);
        }
    }
}
exports.SendGridEmailNotifier = SendGridEmailNotifier;
