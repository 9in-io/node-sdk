"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandlebarsEngine = void 0;
// A variable, so bundlers and TypeScript don't require the package to be installed.
const MODULE = "handlebars";
let handlebars;
function load() {
    if (handlebars)
        return handlebars;
    let mod;
    try {
        mod = require(MODULE);
    }
    catch {
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
class HandlebarsEngine {
    async render(template, data) {
        return load().compile(template)(data);
    }
}
exports.HandlebarsEngine = HandlebarsEngine;
