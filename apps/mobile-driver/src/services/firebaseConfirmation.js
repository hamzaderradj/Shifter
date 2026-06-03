let _confirmation = null;
export const setConfirmation = (confirmation) => { _confirmation = confirmation; };
export const getConfirmation = () => _confirmation;
export const clearConfirmation = () => { _confirmation = null; };
