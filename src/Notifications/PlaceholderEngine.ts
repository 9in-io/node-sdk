import {TemplateEngine} from "./TemplateEngine";

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);
const ESCAPES: Record<string, string> = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;", "`": "&#x60;", "=": "&#x3D;"};

function lookup(data: unknown, path: string): unknown {
    let value: unknown = data;
    for (const key of path.split(".")) {
        if (FORBIDDEN.has(key) || value === null || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
        value = (value as Record<string, unknown>)[key];
    }
    return value;
}

/**
 * The default template engine: fills `{{ data.code }}` (HTML-escaped) and `{{{ data.code }}}`
 * (as is) from the view data `{vars, data}`, the part of Handlebars syntax a message template
 * needs. A missing value prints nothing. For loops, conditions or partials, pass any engine
 * that implements TemplateEngine (see the README for Handlebars in three lines).
 */
export class PlaceholderEngine implements TemplateEngine {
    async render(template: string, data: unknown): Promise<string> {
        return template.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g, (_match, raw: string | undefined, escaped: string | undefined) => {
            const value = lookup(data, (raw ?? escaped)!);
            const text = value === undefined || value === null ? "" : String(value);
            return raw ? text : text.replace(/[&<>"'`=]/g, (ch) => ESCAPES[ch]!);
        });
    }
}
