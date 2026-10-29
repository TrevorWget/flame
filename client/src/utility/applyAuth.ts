// The session token is an HttpOnly cookie the browser sends automatically;
// the server additionally requires this header on requests that change data
export const applyAuth = () => {
  return { 'X-Flame-CSRF': '1' };
};
