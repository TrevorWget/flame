export const isUrlOrIp = (data: string): boolean => {
  const regex =
    /^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?|^((http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/i;

  return regex.test(data);
};

// Distinguishes remote icons from uploaded ones; upload names never contain a
// scheme, and hosts like `localhost` or `nas:8080` have no dot
export const isUrl = (data: string): boolean => {
  const regex = /^https?:\/\/[^\s/?#]+/i;

  return regex.test(data);
};

export const isImage = (data: string): boolean => {
  const regex = /.(jpeg|jpg|png|ico|webp)$/i;

  return regex.test(data);
};

export const isSvg = (data: string): boolean => {
  const regex = /.(svg)$/i;

  return regex.test(data);
};
