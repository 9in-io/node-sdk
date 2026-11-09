"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailchimpEmailNotifier = void 0;
const _1 = require(".");
const Notifier_1 = require("./Notifier");
class MailchimpEmailNotifier extends Notifier_1.Notifier {
    mailchimp;
    constructor(mailchimp, sender, templates = [], vars = {}) {
        super(_1.Notifications.Channel.EMAIL, sender, templates, vars);
        this.mailchimp = mailchimp;
    }
    async notify(receiver, template, data) {
        const messageContent = await this.render(template, data);
        const message = {
            html: messageContent,
            subject: this.vars.subject ?? 'Verification Code',
            from_email: this.sender,
            to: [
                {
                    email: receiver
                }
            ]
        };
        try {
            const response = await this.mailchimp.messages.send({
                message,
            });
            console.debug('Email sent successfully using Mandrill:', response.data[0]);
        }
        catch (error) {
            console.error('Error sending email using Mandrill:', error);
        }
    }
}
exports.MailchimpEmailNotifier = MailchimpEmailNotifier;
