"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notifier = void 0;
const Errors_1 = require("../Errors");
const fs = __importStar(require("fs/promises"));
const PlaceholderEngine_1 = require("./PlaceholderEngine");
const DEFAULT_ENGINE = new PlaceholderEngine_1.PlaceholderEngine();
class Notifier {
    channel;
    sender;
    vars;
    templates = {};
    constructor(channel, sender, templates = [], vars = {}) {
        this.channel = channel;
        this.sender = sender;
        this.vars = vars;
        templates.forEach((template) => {
            this.templates[this.templateKey(template.name)] = template;
        });
    }
    async render(template, data) {
        const tpl = this.templates[this.templateKey(template)];
        if (!tpl) {
            throw new Errors_1.TemplateNotFoundError(template);
        }
        const templateContent = await fs.readFile(tpl.path, 'utf8');
        const viewData = {
            vars: this.vars,
            data: data,
        };
        // Without an engine, `{{ data.code }}` placeholders are filled (PlaceholderEngine).
        return await (tpl.engine ?? DEFAULT_ENGINE).render(templateContent.trim(), viewData);
    }
    setTemplate(template) {
        if (Array.isArray(template)) {
            template.forEach((template) => {
                this.templates[this.templateKey(template.name)] = template;
            });
            return;
        }
        this.templates[this.templateKey(template.name)] = template;
    }
    unsetTemplate(template) {
        delete this.templates[this.templateKey(template)];
    }
    hasTemplate(template) {
        return !!this.templates[this.templateKey(template)];
    }
    clearTemplates() {
        this.templates = {};
    }
    setVar(name, value) {
        this.vars[name] = value;
    }
    unsetVar(name) {
        delete this.vars[name];
    }
    hasVar(name) {
        return !!this.vars[name];
    }
    clearVars() {
        this.vars = {};
    }
    templateKey(template) {
        return template + ':' + this.channel;
    }
}
exports.Notifier = Notifier;
