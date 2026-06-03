/**
 * Stockage temporaire du résultat de confirmation Firebase Phone Auth.
 * Utilisé entre PhoneScreen (qui initie l'auth) et OTPScreen (qui confirme le code).
 * Module singleton — remis à null après confirmation.
 */
let _confirmation = null;

export const setConfirmation = (confirmation) => { _confirmation = confirmation; };
export const getConfirmation = () => _confirmation;
export const clearConfirmation = () => { _confirmation = null; };
