import {describe, expect, it} from '@jest/globals';
import {Notifications, otpSender} from '../index';

class RecordingNotifier extends Notifications.Notifier {
    sent: {receiver: string; template: string; data: unknown}[] = [];

    async notify(receiver: string, template: string, data?: unknown): Promise<void> {
        this.sent.push({receiver, template, data});
    }
}

describe('otpSender', () => {
    it('routes codes to the notifier for the channel', async () => {
        const email = new RecordingNotifier(Notifications.Channel.EMAIL, 'no-reply@acme.test');
        const sms = new RecordingNotifier(Notifications.Channel.SMS, 'Acme');
        const send = otpSender({email, sms});
        const data = {user_id: '42', channel: 'sms', to: '+447700900000', code: '123456', purpose: 'login', expires_at: '2026-11-09T10:05:00.000Z'};

        expect(await send({id: 'e1', event: 'otp.requested', created_at: '2026-11-09T10:00:00.000Z', data})).toBe(true);
        expect(sms.sent).toEqual([{receiver: '+447700900000', template: 'otp', data}]);
        expect(email.sent).toEqual([]);
        expect(await send({id: 'e2', event: 'user.updated', created_at: '', data: {}})).toBe(false);
    });

    it('fails loudly without a notifier', async () => {
        await expect(otpSender({})({id: 'e', event: 'otp.requested', created_at: '', data: {channel: 'email', to: 'x', code: '1'}})).rejects.toThrow('no notifier');
    });
});
