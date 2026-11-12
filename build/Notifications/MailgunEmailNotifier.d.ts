import { Notifications } from ".";
import { Notifier } from "./Notifier";
/**
 * The part of a Mailgun client (`new Mailgun(FormData).client(...)` from mailgun.js) the notifier
 * uses. This package doesn't depend on mailgun.js or its types.
 */
export interface MailgunClient {
    messages: {
        create(domain: string, data: {
            from: string;
            to: string;
            subject: string;
            html: string;
        }): Promise<unknown>;
    };
}
export declare class MailgunEmailNotifier extends Notifier {
    protected client: MailgunClient;
    protected domain: string;
    constructor(mailgun: MailgunClient, domain: string, sender: string, templates?: Notifications.Template[], vars?: any);
    notify(receiver: string, template: string, data?: any): Promise<void>;
}
