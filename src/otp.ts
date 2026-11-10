import type {AdapterEvent} from '@9in-io/sdk/server';
import type {Notifier} from './Notifications/Notifier';

/** Payload of the adapter event `otp.requested` (snake_case, like every 9in payload). */
export interface OtpRequestedData {
    /** Your user id. */
    user_id: string;
    channel: 'email' | 'sms';
    /** Email address or phone number. */
    to: string;
    code: string;
    purpose: 'login' | 'password_reset';
    /** ISO 8601 UTC. */
    expires_at: string;
}

export interface OtpSenderOptions {
    email?: Notifier;
    sms?: Notifier;
    /** Template name registered on the notifiers (default "otp"). */
    template?: string;
}

/**
 * Adapter `onEvent` helper: delivers `otp.requested` codes with the matching notifier
 * (template data: `code`, `purpose`, `expires_at`, `user_id`, `channel`, `to`). Other events
 * are ignored; combine with your own handler:
 *
 *   const sendOtp = otpSender({email: new NodemailerEmailNotifier(...), sms: new TwilioSMSNotifier(...)});
 *   onEvent: async (event) => { await sendOtp(event); … }
 */
export function otpSender(options: OtpSenderOptions) {
    const template = options.template ?? 'otp';
    return async (event: AdapterEvent): Promise<boolean> => {
        if (event.event_type !== 'otp.requested') return false;
        const data = event.data as unknown as OtpRequestedData;
        const notifier = data.channel === 'sms' ? options.sms : options.email;
        if (!notifier) throw new Error(`9in: no notifier configured for ${data.channel} codes`);
        await notifier.notify(data.to, template, data);
        return true;
    };
}
