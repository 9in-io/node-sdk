import { TemplateEngine } from "./TemplateEngine";
/**
 * The default template engine: fills `{{ data.code }}` (HTML-escaped) and `{{{ data.code }}}`
 * (as is) from the view data `{vars, data}`, the part of Handlebars syntax a message template
 * needs. A missing value prints nothing. For loops, conditions or partials, pass any engine
 * that implements TemplateEngine (see the README for Handlebars in three lines).
 */
export declare class PlaceholderEngine implements TemplateEngine {
    render(template: string, data: unknown): Promise<string>;
}
