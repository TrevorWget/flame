import { parseTime } from '.';

export const parseTokenExpire = (expiresAt: number): string => {
  const d = new Date(expiresAt);
  const p = parseTime;

  const useAmericanDate = localStorage.useAmericanDate === 'true';
  const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;

  if (useAmericanDate) {
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${time}`;
  } else {
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${time}`;
  }
};
