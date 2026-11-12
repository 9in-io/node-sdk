import {Notifications} from ".";
import {Notifier} from "./Notifier";
/**
 * The part of a Twilio client (`twilio(accountSid, authToken)`) the notifier uses. This package
 * doesn't depend on the Twilio SDK or its types.
 */
export interface TwilioClient {
    messages: {create(options: {body: string; from: string; to: string}): Promise<{sid: string}>};
}

export class TwilioSMSNotifier extends Notifier {
    private client: TwilioClient;

    constructor(
        twilio: TwilioClient,
        sender: string,
        templates: Notifications.Template[] = [],
        vars: any = {}
    ) {
        super(Notifications.Channel.SMS, sender, templates, vars);
        this.client = twilio;
    }

    async notify(receiver: string, template: string, data?: any): Promise<void> {
        const message = await this.render(template, data);

        try {
            const response = await this.client.messages.create({
                body: message,
                from: this.sender,
                to: receiver
            });
            console.debug(`Message sent using Twilio with SID: ${response.sid}`);
        } catch (error) {
            console.error('Error sending SMS using Twilio:', error);
        }
    }
}
