import {TemplateEngine} from "./TemplateEngine";

interface HandlebarsModule {
    compile(template: string): (data: unknown) => string;
}

// A variable, so bundlers and TypeScript don't require the package to be installed.
const MODULE = "handlebars";
let handlebars: HandlebarsModule | undefined;

function load(): HandlebarsModule {
    if (handlebars) return handlebars;
    let mod: HandlebarsModule & { default?: HandlebarsModule };
    try {
        mod = require(MODULE);
    } catch {
        throw new Error("Notifications.HandlebarsEngine needs the handlebars package: npm install handlebars");
    }
    handlebars = mod.default ?? mod;
    return handlebars;
}

/**
 * Renders templates with Handlebars, for templates that use `{{#if}}`, `{{#each}}`, helpers or
 * partials. `handlebars` is not a dependency of this package: install it yourself. Templates that
 * only print values don't need it; without an engine they use PlaceholderEngine.
 */
export class HandlebarsEngine implements TemplateEngine {
    async render(template: string, data: any): Promise<string> {
        return load().compile(template)(data);
    }
}
