import { Notifications } from ".";
import { Notifier } from "./Notifier";
/**
 * The part of SendGrid's mail client (the default export of @sendgrid/mail) the notifier uses. This
 * package doesn't depend on the SendGrid SDK or its types.
 */
export interface SendGridClient {
    send(message: {
        to: string;
        from: string;
        subject: string;
        html: string;
    }): Promise<unknown>;
}
export declare class SendGridEmailNotifier extends Notifier {
    private client;
    constructor(sgMailInstance: SendGridClient, sender: string, templates?: Notifications.Template[], vars?: any);
    notify(receiver: string, template: string, data?: any): Promise<void>;
}
