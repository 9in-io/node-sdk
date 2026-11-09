"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESEmailNotifier = void 0;
const _1 = require(".");
const Notifier_1 = require("./Notifier");
class SESEmailNotifier extends Notifier_1.Notifier {
    client;
    constructor(ses, sender, templates = [], vars = {}) {
        super(_1.Notifications.Channel.EMAIL, sender, templates, vars);
        this.client = ses;
    }
    async notify(receiver, template, data) {
        const messageContent = await this.render(template, data);
        const params = {
            Source: this.sender,
            Destination: {
                ToAddresses: [receiver]
            },
            Message: {
                Body: {
                    Html: {
                        Data: messageContent,
                    }
                },
                Subject: {
                    Data: this.vars.subject ?? 'Verification Code',
                }
            }
        };
        try {
            const response = await this.client.sendEmail(params).promise();
            console.debug('Email sent successfully using SES:', response);
        }
        catch (error) {
            console.error('Error sending email using SES:', error);
        }
    }
}
exports.SESEmailNotifier = SESEmailNotifier;
