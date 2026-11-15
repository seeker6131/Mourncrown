// 🤝 Invite a friend (director 15 Nov): every account has a code; a new player types a friend's code once (in their first
// 3 days, before Lv10). Rewards are paid by the server when the friend really plays: the friend gets diamonds at Lv10, the
// inviter gets diamonds when the friend reaches Lv30, and a Limited wing at 3 such friends. Same network (IP) as the
// inviter = refused (no alt-account farming); at most REF_MAX paid friends per inviter.
export const REF_NEW_DIA = 30;        // the new friend, at Lv10
export const REF_INVITER_DIA = 50;    // the inviter, each friend at Lv30
export const REF_WING_AT = 3;         // friends at Lv30 for the Limited wing
export const REF_WING = 'ltd';        // ปีกพายุอสนี (Limited)
export const REF_MAX = 20;
export const REF_DAYS = 3;
/** the code a player shares: the start of the account id */
export const refCode = (id: string) => id.slice(0, 8).toUpperCase();
