import { Notifications } from ".";
import { Notifier } from "./Notifier";
/** The email SES sends: the AWS SDK's `SES.SendEmailRequest`, as far as the notifier fills it. */
export interface SESSendEmailRequest {
    Source: string;
    Destination: {
        ToAddresses: string[];
    };
    Message: {
        Body: {
            Html: {
                Data: string;
            };
        };
        Subject: {
            Data: string;
        };
    };
}
/**
 * The part of an AWS SDK for JavaScript v2 SES client (`new AWS.SES()`) the notifier uses. This
 * package doesn't depend on the AWS SDK or its types.
 */
export interface SESClient {
    sendEmail(params: SESSendEmailRequest): {
        promise(): Promise<unknown>;
    };
}
export declare class SESEmailNotifier extends Notifier {
    private client;
    constructor(ses: SESClient, sender: string, templates?: Notifications.Template[], vars?: any);
    notify(receiver: string, template: string, data?: any): Promise<void>;
}
