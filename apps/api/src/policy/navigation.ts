const privateHost =
  /^(localhost$|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|\[)/i;
export const validateNavigationUrl = (value: string, allowDemo = true): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Navigation target is not a valid URL");
  }
  if (
    url.protocol !== "https:" &&
    !(allowDemo && url.hostname === "demo.jev.local")
  )
    throw new Error("Only HTTPS and the local demo site are allowed");
  if (
    url.username || url.password ||
    privateHost.test(url.hostname) ||
    url.hostname.endsWith(".localhost") ||
    (!allowDemo && url.hostname.endsWith(".local")) ||
    url.hostname.endsWith(".internal") ||
    url.hostname === "metadata.google.internal"
  )
    throw new Error("Private and metadata targets are blocked");
  return url;
};
