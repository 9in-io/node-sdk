"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaceholderEngine = void 0;
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;", "`": "&#x60;", "=": "&#x3D;" };
function lookup(data, path) {
    let value = data;
    for (const key of path.split(".")) {
        if (FORBIDDEN.has(key) || value === null || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, key))
            return undefined;
        value = value[key];
    }
    return value;
}
/**
 * The default template engine: fills `{{ data.code }}` (HTML-escaped) and `{{{ data.code }}}`
 * (as is) from the view data `{vars, data}`, the part of Handlebars syntax a message template
 * needs. A missing value prints nothing. For loops, conditions or partials, pass any engine
 * that implements TemplateEngine (see the README for Handlebars in three lines).
 */
class PlaceholderEngine {
    async render(template, data) {
        return template.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g, (_match, raw, escaped) => {
            const value = lookup(data, (raw ?? escaped));
            const text = value === undefined || value === null ? "" : String(value);
            return raw ? text : text.replace(/[&<>"'`=]/g, (ch) => ESCAPES[ch]);
        });
    }
}
exports.PlaceholderEngine = PlaceholderEngine;
