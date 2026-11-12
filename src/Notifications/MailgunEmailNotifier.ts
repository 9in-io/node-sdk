import {Notifications} from ".";
import {Notifier} from "./Notifier";
/**
 * The part of a Mailgun client (`new Mailgun(FormData).client(...)` from mailgun.js) the notifier
 * uses. This package doesn't depend on mailgun.js or its types.
 */
export interface MailgunClient {
    messages: {create(domain: string, data: {from: string; to: string; subject: string; html: string}): Promise<unknown>};
}

export class MailgunEmailNotifier extends Notifier {
    protected client: MailgunClient;
    protected domain: string;

    constructor(
        mailgun: MailgunClient,
        domain: string,
        sender: string,
        templates: Notifications.Template[] = [],
        vars: any = {}
    ) {
        super(Notifications.Channel.EMAIL, sender, templates, vars);
        this.client = mailgun;
        this.domain = domain;
    }

    async notify(receiver: string, template: string, data?: any): Promise<void> {
        const messageContent = await this.render(template, data);

        const messageData = {
            from: this.sender,
            to: receiver,
            subject: this.vars.subject ?? 'Verification Code',
            html: messageContent,
        };

        try {
            const response = await this.client.messages.create(this.domain, messageData);
            console.log('Email sent successfully using Mailgun:', response);
        } catch (error) {
            console.error('Error sending email using Mailgun:', error);
        }
    }
}
