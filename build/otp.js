"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.otpSender = otpSender;
/**
 * Adapter `onEvent` helper: delivers `otp.requested` codes with the matching notifier
 * (template data: `code`, `purpose`, `expires_at`, `user_id`, `channel`, `to`). Other events
 * are ignored; combine with your own handler:
 *
 *   const sendOtp = otpSender({email: new NodemailerEmailNotifier(...), sms: new TwilioSMSNotifier(...)});
 *   onEvent: async (event) => { await sendOtp(event); … }
 */
function otpSender(options) {
    const template = options.template ?? 'otp';
    return async (event) => {
        if (event.event !== 'otp.requested')
            return false;
        const data = event.data;
        const notifier = data.channel === 'sms' ? options.sms : options.email;
        if (!notifier)
            throw new Error(`9in: no notifier configured for ${data.channel} codes`);
        await notifier.notify(data.to, template, data);
        return true;
    };
}
