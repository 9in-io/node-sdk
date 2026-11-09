import * as APIResponseInternal from "./APIResponse";
import * as SignatureInternal from "./Signature";
import * as TokenInternal from "./Token";
import * as FilterInternal from "./Filter";
import * as SortInternal from "./Sort";

import * as AuthResponseEntityInternal from "./Entities/AuthResponseEntity";
import * as PaginatedResponseInternal from "./Entities/PaginatedResponseEntity";
import * as TokenEntityInternal from "./Entities/TokenEntity";
import * as ClientEntityInternal from "./Entities/ClientEntity";
import * as OTPOptionEntityInternal from "./Entities/OTPOptionEntity";
import * as ScopeEntityInternal from "./Entities/ScopeEntity";
import * as UserEntityInternal from "./Entities/UserEntity";

export namespace Models {
    export import FilterOperator = FilterInternal.FilterOperator;
    export import OTPType = OTPOptionEntityInternal.OTPType;
    export import OTPAction = OTPOptionEntityInternal.OTPAction;
    export import SortOrder = SortInternal.SortOrder;
    export import Gender = UserEntityInternal.Gender;

    export type APIResponse = APIResponseInternal.APIResponse;
    export type Signature = SignatureInternal.Signature;
    export type Token = TokenInternal.Token;
    export type Filter = FilterInternal.Filter;
    export type FilterGroup = (Filter | FilterGroup)[];
    export type Sort = SortInternal.Sort;

    export type AuthResponseEntity = AuthResponseEntityInternal.AuthResponseEntity;
    export type PaginatedResponse = PaginatedResponseInternal.PaginatedResponseEntity;
    export type TokenEntity = TokenEntityInternal.TokenEntity;
    export type ClientEntity = ClientEntityInternal.ClientEntity;
    export type OTPOptionEntity = OTPOptionEntityInternal.OTPOptionEntity;
    export type ScopeEntity = ScopeEntityInternal.ScopeEntity;
    export type UserEntity = UserEntityInternal.UserEntity;
}
