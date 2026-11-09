"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleNotifier = void 0;
const Notifier_1 = require("./Notifier");
class ConsoleNotifier extends Notifier_1.Notifier {
    async notify(receiver, template, data) {
        const message = await this.render(template, data);
        console.log({
            from: this.sender,
            to: receiver,
            message: message,
        });
    }
}
exports.ConsoleNotifier = ConsoleNotifier;
