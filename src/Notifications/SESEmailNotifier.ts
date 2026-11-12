import {Notifications} from ".";
import {Notifier} from "./Notifier";
/** The email SES sends: the AWS SDK's `SES.SendEmailRequest`, as far as the notifier fills it. */
export interface SESSendEmailRequest {
    Source: string;
    Destination: {ToAddresses: string[]};
    Message: {Body: {Html: {Data: string}}; Subject: {Data: string}};
}

/**
 * The part of an AWS SDK for JavaScript v2 SES client (`new AWS.SES()`) the notifier uses. This
 * package doesn't depend on the AWS SDK or its types.
 */
export interface SESClient {
    sendEmail(params: SESSendEmailRequest): {promise(): Promise<unknown>};
}

export class SESEmailNotifier extends Notifier {
    private client: SESClient;

    constructor(
        ses: SESClient,
        sender: string,
        templates: Notifications.Template[] = [],
        vars: any = {}
    ) {
        super(Notifications.Channel.EMAIL, sender, templates, vars);
        this.client = ses;
    }

    async notify(receiver: string, template: string, data?: any): Promise<void> {
        const messageContent = await this.render(template, data);

        const params: SESSendEmailRequest = {
            Source: this.sender,
            Destination: {
                ToAddresses: [receiver]
            },
            Message: {
                Body: {
                    Html: {
                        Data: messageContent,
                    }
                },
                Subject: {
                    Data: this.vars.subject ?? 'Verification Code',
                }
            }
        };

        try {
            const response = await this.client.sendEmail(params).promise();
            console.debug('Email sent successfully using SES:', response);
        } catch (error) {
            console.error('Error sending email using SES:', error);
        }
    }
}
