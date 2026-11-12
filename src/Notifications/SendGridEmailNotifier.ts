import {Notifications} from ".";
import {Notifier} from "./Notifier";
/**
 * The part of SendGrid's mail client (the default export of @sendgrid/mail) the notifier uses. This
 * package doesn't depend on the SendGrid SDK or its types.
 */
export interface SendGridClient {
    send(message: {to: string; from: string; subject: string; html: string}): Promise<unknown>;
}

export class SendGridEmailNotifier extends Notifier {
    private client: SendGridClient;

    constructor(
        sgMailInstance: SendGridClient,
        sender: string,
        templates: Notifications.Template[] = [],
        vars: any = {}
    ) {
        super(Notifications.Channel.EMAIL, sender, templates, vars);
        this.client = sgMailInstance;
    }

    async notify(receiver: string, template: string, data?: any): Promise<void> {
        const messageContent = await this.render(template, data);

        const msg = {
            to: receiver,
            from: this.sender,
            subject: this.vars.subject ?? 'Verification Code',
            html: messageContent,
        };

        try {
            await this.client.send(msg);
            console.debug('Email sent successfully using SendGrid');
        } catch (error) {
            console.error('Error sending email using SendGrid:', error);
        }
    }
}
