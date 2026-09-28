// b64.js：三字节一组与残留
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// 把缓冲前三个字节按每六位一个字符编成四个字符；不足三个字节给空串。
export function groupOf(buffer) {
  if (typeof buffer !== "string" || buffer.length < 3) return "";
  const b0 = buffer.charCodeAt(0);
  const b1 = buffer.charCodeAt(1);
  const b2 = buffer.charCodeAt(2);
  const triplet = (b0 << 16) | (b1 << 8) | b2;
  return ALPHABET[(triplet >> 18) & 63]
    + ALPHABET[(triplet >> 12) & 63]
    + ALPHABET[(triplet >> 6) & 63]
    + ALPHABET[triplet & 63];
}

// 去掉前三个字节之后的残留；不足三个字节原样返回。
export function leftOf(buffer) {
  if (typeof buffer !== "string" || buffer.length < 3) return buffer;
  return buffer.slice(3);
}
