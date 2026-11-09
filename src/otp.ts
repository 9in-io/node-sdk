import type {AdapterEvent} from '@9in-io/sdk/server';
import type {Notifier} from './Notifications/Notifier';

/** Payload of the adapter event `otp.requested`. */
export interface OtpRequestedData {
    /** Your user id. */
    userId: string;
    channel: 'email' | 'sms';
    /** Email address or phone number. */
    to: string;
    code: string;
    purpose: 'login' | 'password_reset';
    expiresAt: string;
}

export interface OtpSenderOptions {
    email?: Notifier;
    sms?: Notifier;
    /** Template name registered on the notifiers (default "otp"). */
    template?: string;
}

/**
 * Adapter `onEvent` helper: delivers `otp.requested` codes with the matching notifier
 * (template data: `code`, `purpose`, `expiresAt`, `userId`, `channel`, `to`). Other events
 * are ignored; combine with your own handler:
 *
 *   const sendOtp = otpSender({email: new NodemailerEmailNotifier(...), sms: new TwilioSMSNotifier(...)});
 *   onEvent: async (event) => { await sendOtp(event); … }
 */
export function otpSender(options: OtpSenderOptions) {
    const template = options.template ?? 'otp';
    return async (event: AdapterEvent): Promise<boolean> => {
        if (event.type !== 'otp.requested') return false;
        const data = event.data as unknown as OtpRequestedData;
        const notifier = data.channel === 'sms' ? options.sms : options.email;
        if (!notifier) throw new Error(`9in: no notifier configured for ${data.channel} codes`);
        await notifier.notify(data.to, template, data);
        return true;
    };
}
