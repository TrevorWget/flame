// Codes the server's OIDC callback reports in the ?ssoError= query parameter
const SSO_ERRORS: Record<string, string> = {
  expired:
    'The login timed out or your browser blocked its cookie. Please try again.',
  denied: 'The identity provider did not approve the login.',
  forbidden: 'Your account is not in a group that is allowed to use Flame.',
  unavailable: 'The identity provider could not be reached.',
  failed: 'Single sign-on failed. See the Flame logs for details.',
};

export const ssoErrorMessage = (code: string): string =>
  SSO_ERRORS[code] ?? SSO_ERRORS.failed;

export const oidcLoginUrl = (duration: string): string =>
  `/api/auth/oidc/login?duration=${encodeURIComponent(duration)}`;
