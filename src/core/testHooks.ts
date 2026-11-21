// Console shortcuts (window.__game, __tdS, __dbg) exist ONLY on the developer's own machine (localhost) for the
// automated tests — never on the public site (director: Pixeldeck Battle was hacked through the console).
export const TEST_HOOKS = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);
