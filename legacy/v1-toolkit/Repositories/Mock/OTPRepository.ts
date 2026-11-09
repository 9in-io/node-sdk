import {Repositories} from "..";
import {Models} from "../../Models";

export class OTPRepository implements Repositories.OTPRepository {
    async destroyVerificationCode(optionId: string, code: string, ip?: string): Promise<void> {
        return;
    }

    async findAllByAction(userId: string, action: Models.OTPAction, ip?: string): Promise<Models.OTPOptionEntity[]> {
        return this.options(userId, <Models.OTPAction>action);
    }

    async findById(optionId: string, ip?: string): Promise<Models.OTPOptionEntity | null> {
        const [entity, userId, action] = optionId.split('/');

        return this.options(userId, <Models.OTPAction>action)
            .filter((option: Models.OTPOptionEntity) => {
                return option.id === optionId;
            })
            [0];
    }

    async newVerificationCode(option: Models.OTPOptionEntity, ip?: string): Promise<string> {
        return '777777';
    }

    async verify(optionId: string, code: string, ip?: string): Promise<boolean> {
        return code === '777777';
    }

    private options(userId: string, action: Models.OTPAction): Models.OTPOptionEntity[] {
        return [
            {
                id: `user/${userId}/sms`,
                type: Models.OTPType.SMS,
                to: '+4*********92',
                hint: '+4*********92',
                user_id: userId,
                action: action,
            },
            {
                id: `user/${userId}/call`,
                type: Models.OTPType.Call,
                to: '+4*********92',
                hint: '+4*********92',
                user_id: userId,
                action: action,
            },
            {
                id: `user/${userId}/email`,
                type: Models.OTPType.Email,
                to: '***st@***fy.com',
                hint: '***st@***fy.com',
                user_id: userId,
                action: action,
            }
        ];
    }
}
