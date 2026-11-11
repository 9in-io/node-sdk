import {Notifications} from ".";

export interface Template {
    name: string;
    path: string;
    /** Default: PlaceholderEngine (`{{ data.code }}`). */
    engine?: Notifications.TemplateEngine;
    channel: Notifications.Channel;
}
