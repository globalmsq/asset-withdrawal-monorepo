"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRole = exports.WithdrawalType = exports.TransactionStatus = void 0;
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["PENDING"] = "PENDING";
    TransactionStatus["VALIDATING"] = "VALIDATING";
    TransactionStatus["SIGNING"] = "SIGNING";
    TransactionStatus["SIGNED"] = "SIGNED";
    TransactionStatus["BROADCASTING"] = "BROADCASTING";
    TransactionStatus["COMPLETED"] = "COMPLETED";
    TransactionStatus["FAILED"] = "FAILED";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
var WithdrawalType;
(function (WithdrawalType) {
    WithdrawalType["SINGLE"] = "SINGLE";
    WithdrawalType["BATCH"] = "BATCH";
})(WithdrawalType || (exports.WithdrawalType = WithdrawalType = {}));
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "ADMIN";
    UserRole["USER"] = "USER";
})(UserRole || (exports.UserRole = UserRole = {}));
//# sourceMappingURL=types.js.map