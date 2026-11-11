import {describe, expect, it, jest} from '@jest/globals';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {Notifications} from '../index';

describe('PlaceholderEngine', () => {
    const engine = new Notifications.PlaceholderEngine();

    it('fills nested values, escapes HTML and leaves raw values as they are', async () => {
        const view = {vars: {app: 'Acme & Co'}, data: {code: '123456', to: '<jane@acme.test>'}};
        expect(await engine.render('{{vars.app}}: {{ data.code }} for {{data.to}} / {{{data.to}}}', view))
            .toBe('Acme &amp; Co: 123456 for &lt;jane@acme.test&gt; / <jane@acme.test>');
    });

    it('prints nothing for missing values and never reads inherited properties', async () => {
        expect(await engine.render('[{{data.nope}}][{{data.__proto__}}][{{data.constructor}}][{{data.toString}}]', {data: {}})).toBe('[][][][]');
        expect(await engine.render('{{data.n}} {{data.ok}}', {data: {n: 0, ok: false}})).toBe('0 false');
    });
});

describe('Notifier templates', () => {
    class Capture extends Notifications.Notifier {
        last = '';
        async notify(_receiver: string, template: string, data?: unknown): Promise<void> {
            this.last = await this.render(template, data);
        }
    }

    it('render with placeholders when no engine is set, or with the given engine', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nine-tpl-'));
        const file = path.join(dir, 'otp.txt');
        await fs.writeFile(file, 'Your {{vars.app}} code is {{data.code}}.\n');
        const plain = new Capture(Notifications.Channel.SMS, 'Acme', [{name: 'otp', channel: Notifications.Channel.SMS, path: file}], {app: 'Acme'});
        await plain.notify('+447700900000', 'otp', {code: '654321'});
        expect(plain.last).toBe('Your Acme code is 654321.');

        const upper = {render: async (template: string) => template.toUpperCase()};
        const custom = new Capture(Notifications.Channel.SMS, 'Acme', [{name: 'otp', channel: Notifications.Channel.SMS, path: file, engine: upper}]);
        await custom.notify('+447700900000', 'otp', {code: '1'});
        expect(custom.last).toBe('YOUR {{VARS.APP}} CODE IS {{DATA.CODE}}.');
    });
});

describe('HandlebarsEngine', () => {
    it('renders with handlebars when the app has it installed', async () => {
        const engine = new Notifications.HandlebarsEngine();
        const view = {vars: {app: 'Acme'}, data: {codes: ['1', '2'], vip: true}};
        expect(await engine.render('{{vars.app}}:{{#each data.codes}} {{this}}{{/each}}{{#if data.vip}}!{{/if}}', view)).toBe('Acme: 1 2!');
    });

    it('says to install handlebars when it is missing', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.doMock('handlebars', () => {
                throw new Error("Cannot find module 'handlebars'");
            });
            const {Notifications: Isolated} = await import('../index');
            await expect(new Isolated.HandlebarsEngine().render('{{x}}', {x: 1})).rejects.toThrow('npm install handlebars');
        });
    });
});
