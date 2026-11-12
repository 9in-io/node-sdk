import {Notifications} from ".";
import {Notifier} from "./Notifier";
/**
 * The part of a Nodemailer transporter (`nodemailer.createTransport(...)`) the notifier uses. Any
 * Nodemailer version fits; this package doesn't depend on Nodemailer or its types.
 */
export interface MailTransporter {
    sendMail(options: {to: string; from: string; subject: string; html: string}): Promise<{messageId?: string}>;
}

export class NodemailerEmailNotifier extends Notifier {
    private client: MailTransporter;

    constructor(
        transporter: MailTransporter,
        channel: Notifications.Channel,
        sender: string,
        templates: Notifications.Template[] = [],
        vars: any = {}
    ) {
        super(channel, sender, templates, vars);
        this.client = transporter;
    }

    async notify(receiver: string, template: string, data?: any): Promise<void> {
        const messageContent = await this.render(template, data);

        const mailOptions = {
            to: receiver,
            from: this.sender,
            subject: this.vars.subject ?? 'Verification Code',
            html: messageContent,
        };

        try {
            const info = await this.client.sendMail(mailOptions);
            console.debug('Message sent successfully using Nodemailer:', info.messageId);
        } catch (err) {
            console.error('Error sending email using Nodemailer:', err);
        }
    }
}
