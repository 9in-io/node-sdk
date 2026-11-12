import { Notifications } from ".";
import { Notifier } from "./Notifier";
/**
 * The part of a Twilio client (`twilio(accountSid, authToken)`) the notifier uses. This package
 * doesn't depend on the Twilio SDK or its types.
 */
export interface TwilioClient {
    messages: {
        create(options: {
            body: string;
            from: string;
            to: string;
        }): Promise<{
            sid: string;
        }>;
    };
}
export declare class TwilioSMSNotifier extends Notifier {
    private client;
    constructor(twilio: TwilioClient, sender: string, templates?: Notifications.Template[], vars?: any);
    notify(receiver: string, template: string, data?: any): Promise<void>;
}
