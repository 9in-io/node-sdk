import {Notifications} from ".";
import {Notifier} from "./Notifier";
/**
 * The part of a Vonage client (`new Vonage(...)` from @vonage/server-sdk) the notifier uses. This
 * package doesn't depend on the Vonage SDK or its types.
 */
export interface VonageClient {
    sms: {send(params: {from: string; to: string; text: string}): Promise<unknown>};
}

export class VonageSMSNotifier extends Notifier {
    private client: VonageClient;

    constructor(
        vonage: VonageClient,
        channel: Notifications.Channel,
        sender: string,
        templates: Notifications.Template[] = [],
        vars: any = {}
    ) {
        super(channel, sender, templates, vars);
        this.client = vonage;
    }

    async notify(receiver: string, template: string, data?: any): Promise<void> {
        const messageContent = await this.render(template, data);

        try {
            const responseData: any = await this.client.sms.send({
                from: this.sender,
                to: receiver,
                text: messageContent
            });

            console.debug('SMS sent successfully using Vonage:', responseData);

        } catch (err) {
            console.error('Error sending SMS using Vonage:', err);
        }
    }
}
