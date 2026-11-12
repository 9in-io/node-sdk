import { Notifications } from ".";
import { Notifier } from "./Notifier";
/**
 * The part of a Vonage client (`new Vonage(...)` from @vonage/server-sdk) the notifier uses. This
 * package doesn't depend on the Vonage SDK or its types.
 */
export interface VonageClient {
    sms: {
        send(params: {
            from: string;
            to: string;
            text: string;
        }): Promise<unknown>;
    };
}
export declare class VonageSMSNotifier extends Notifier {
    private client;
    constructor(vonage: VonageClient, channel: Notifications.Channel, sender: string, templates?: Notifications.Template[], vars?: any);
    notify(receiver: string, template: string, data?: any): Promise<void>;
}
