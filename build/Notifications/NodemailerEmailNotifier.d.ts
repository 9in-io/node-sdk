import { Notifications } from ".";
import { Notifier } from "./Notifier";
/**
 * The part of a Nodemailer transporter (`nodemailer.createTransport(...)`) the notifier uses. Any
 * Nodemailer version fits; this package doesn't depend on Nodemailer or its types.
 */
export interface MailTransporter {
    sendMail(options: {
        to: string;
        from: string;
        subject: string;
        html: string;
    }): Promise<{
        messageId?: string;
    }>;
}
export declare class NodemailerEmailNotifier extends Notifier {
    private client;
    constructor(transporter: MailTransporter, channel: Notifications.Channel, sender: string, templates?: Notifications.Template[], vars?: any);
    notify(receiver: string, template: string, data?: any): Promise<void>;
}
