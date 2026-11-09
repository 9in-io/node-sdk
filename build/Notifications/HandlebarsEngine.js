"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandlebarsEngine = void 0;
const handlebars_1 = __importDefault(require("handlebars"));
class HandlebarsEngine {
    async render(template, data) {
        return handlebars_1.default.compile(template)(data);
    }
}
exports.HandlebarsEngine = HandlebarsEngine;
