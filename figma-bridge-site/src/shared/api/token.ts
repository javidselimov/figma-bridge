type TokenListener = () => void;

let accessToken: string | null = null;
let onLogout: TokenListener = () => {};

// Access token lives in memory only — never in Zustand or web storage.
export const tokenStorage = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
  setLogoutHandler: (fn: TokenListener) => {
    onLogout = fn;
  },
  logout: () => {
    accessToken = null;
    onLogout();
  },
};
