import { TemplateEngine } from "./TemplateEngine";
/**
 * Renders templates with Handlebars, for templates that use `{{#if}}`, `{{#each}}`, helpers or
 * partials. `handlebars` is not a dependency of this package: install it yourself. Templates that
 * only print values don't need it; without an engine they use PlaceholderEngine.
 */
export declare class HandlebarsEngine implements TemplateEngine {
    render(template: string, data: any): Promise<string>;
}
