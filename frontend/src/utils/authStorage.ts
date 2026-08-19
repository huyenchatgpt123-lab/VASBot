const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const REMEMBER_KEY = 'vatask_remember_me';
const EMAIL_KEY = 'vatask_remembered_email';

function clearTokenAndUser(store: Storage) {
  store.removeItem(TOKEN_KEY);
  store.removeItem(USER_KEY);
}

/** Prefer session token (this tab) over localStorage (remembered). */
export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function clearAuthSession() {
  clearTokenAndUser(localStorage);
  clearTokenAndUser(sessionStorage);
}

export function setAuthSession(
  token: string,
  userJson: string,
  remember: boolean,
) {
  clearAuthSession();
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
  store.setItem(USER_KEY, userJson);
  localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
}

/** Update cached user in whichever store holds the active token. */
export function setAuthUserJson(userJson: string) {
  if (sessionStorage.getItem(TOKEN_KEY)) {
    sessionStorage.setItem(USER_KEY, userJson);
  } else if (localStorage.getItem(TOKEN_KEY)) {
    localStorage.setItem(USER_KEY, userJson);
  }
}

export function getRememberMePreference(): boolean {
  const v = localStorage.getItem(REMEMBER_KEY);
  // Existing installs already persisted in localStorage — default on.
  if (v === null) return true;
  return v === '1';
}

export function getRememberedEmail(): string {
  return localStorage.getItem(EMAIL_KEY) || '';
}

export function setRememberedEmail(email: string | null) {
  const clean = (email || '').trim();
  if (clean) {
    localStorage.setItem(EMAIL_KEY, clean);
  } else {
    localStorage.removeItem(EMAIL_KEY);
  }
}
