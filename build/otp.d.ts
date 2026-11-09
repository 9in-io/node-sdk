import type { AdapterEvent } from '@9in/sdk/server';
import type { Notifier } from './Notifications/Notifier';
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
export declare function otpSender(options: OtpSenderOptions): (event: AdapterEvent) => Promise<boolean>;
