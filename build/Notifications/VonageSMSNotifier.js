"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VonageSMSNotifier = void 0;
const Notifier_1 = require("./Notifier");
class VonageSMSNotifier extends Notifier_1.Notifier {
    client;
    constructor(vonage, channel, sender, templates = [], vars = {}) {
        super(channel, sender, templates, vars);
        this.client = vonage;
    }
    async notify(receiver, template, data) {
        const messageContent = await this.render(template, data);
        try {
            const responseData = await this.client.sms.send({
                from: this.sender,
                to: receiver,
                text: messageContent
            });
            console.debug('SMS sent successfully using Vonage:', responseData);
        }
        catch (err) {
            console.error('Error sending SMS using Vonage:', err);
        }
    }
}
exports.VonageSMSNotifier = VonageSMSNotifier;
