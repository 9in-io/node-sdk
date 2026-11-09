"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwilioSMSNotifier = void 0;
const _1 = require(".");
const Notifier_1 = require("./Notifier");
class TwilioSMSNotifier extends Notifier_1.Notifier {
    client;
    constructor(twilio, sender, templates = [], vars = {}) {
        super(_1.Notifications.Channel.SMS, sender, templates, vars);
        this.client = twilio;
    }
    async notify(receiver, template, data) {
        const message = await this.render(template, data);
        try {
            const response = await this.client.messages.create({
                body: message,
                from: this.sender,
                to: receiver
            });
            console.debug(`Message sent using Twilio with SID: ${response.sid}`);
        }
        catch (error) {
            console.error('Error sending SMS using Twilio:', error);
        }
    }
}
exports.TwilioSMSNotifier = TwilioSMSNotifier;
