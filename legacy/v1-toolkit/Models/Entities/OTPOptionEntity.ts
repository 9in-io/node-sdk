export enum OTPType {
    Email = 'email',
    SMS = 'sms',
    Call = 'call',
}

export enum OTPAction {
    Login = 'login',
    PasswordReset = 'password_reset',
    PasswordRenew = 'password_renew',
}

export interface OTPOptionEntity {
    id: string
    type: OTPType
    to: string
    hint: string
    user_id: string
    action: OTPAction
}
