/** Base64 */
const BASE64_KEYS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const BASE64_VALUES = new Array(123); // max char code in base64Keys
for (let i = 0; i < 123; ++i) BASE64_VALUES[i] = 64; // fill with placeholder('=') index
for (let i = 0; i < 64; ++i) BASE64_VALUES[BASE64_KEYS.charCodeAt(i)] = i;

const HexChars = "0123456789abcdef".split("");

const _t = ["", "", "", ""];
const UuidTemplate = _t.concat(_t, "-", _t, "-", _t, "-", _t, "-", _t, _t, _t);
const Indices = UuidTemplate.map((x, i) => (x === "-" ? NaN : i)).filter(
  isFinite
);

/**
 * short uuid -> long uuid
 * 支持 22 / 23 位
 */
function decodeUuid(e) {
  const r = BASE64_VALUES;

  // 23 位（新格式，前 5 位原样保留）
  if (e.length === 23) {
    let t = [];
    for (let i = 5; i < 23; i += 2) {
      let n = r[e.charCodeAt(i)];
      let s = r[e.charCodeAt(i + 1)];
      t.push((n >> 2).toString(16));
      t.push((((n & 3) << 2) | (s >> 4)).toString(16));
      t.push((s & 15).toString(16));
    }
    e = e.slice(0, 5) + t.join("");
  }
  // 22 位（旧格式，前 2 位原样保留）
  else {
    if (e.length !== 22) return e;

    let t = [];
    for (let i = 2; i < 22; i += 2) {
      let n = r[e.charCodeAt(i)];
      let s = r[e.charCodeAt(i + 1)];
      t.push((n >> 2).toString(16));
      t.push((((n & 3) << 2) | (s >> 4)).toString(16));
      t.push((s & 15).toString(16));
    }
    e = e.slice(0, 2) + t.join("");
  }

  // 组装成标准 UUID
  return [
    e.slice(0, 8),
    e.slice(8, 12),
    e.slice(12, 16),
    e.slice(16, 20),
    e.slice(20),
  ].join("-");
}

/**
 * long uuid -> short uuid
 */
/**
 * long uuid -> short uuid
 * fc991dd7-0033-4b80-9d41-c8a86a702e59 -> fcmR3XADNLgJ1ByKhqcC5Z
 */
function encodeUuid(uuid, min = false) {
  if (typeof uuid !== "string" || uuid.length !== 36) {
    return uuid;
  }

  // 移除连字符并转换为小写
  const hex = uuid.replace(/-/g, "").toLowerCase();

  // 确定保留的前缀长度
  const reserved = min ? 2 : 5;

  const out = [];

  // 保留前面的十六进制字符
  for (let i = 0; i < reserved; i++) {
    out[i] = hex[i];
  }

  // 将剩余部分压缩为 base64
  let j = reserved;
  for (let i = reserved; i < 32; i += 3) {
    const hexVal1 = parseInt(hex[i], 16);
    const hexVal2 = parseInt(hex[i + 1], 16);
    const hexVal3 = parseInt(hex[i + 2], 16);

    out[j++] = BASE64_KEYS[(hexVal1 << 2) | (hexVal2 >> 2)];
    out[j++] = BASE64_KEYS[((hexVal2 & 3) << 4) | hexVal3];
  }

  return out.join("");
}

/** helpers */
function isShortUUID(uuid) {
  return typeof uuid === "string" && uuid.length === 22;
}

function isLongUUID(uuid) {
  return typeof uuid === "string" && uuid.length === 36 && uuid.includes("-");
}

function normalizeToShort(uuid) {
  if (isShortUUID(uuid)) return uuid;
  if (isLongUUID(uuid)) return encodeUuid(uuid);
  return uuid;
}

function normalizeToLong(uuid) {
  if (isLongUUID(uuid)) return uuid;
  if (isShortUUID(uuid)) return decodeUuid(uuid);
  return uuid;
}

/**
 * 辅助函数：判断字符串是否为 UUID
 */
function isUUID(str) {
  return /^[a-f0-9\-]{20,}$/i.test(str) || str.includes("-");
}
/**
 * 构建规范化的脚本映射
 */
function buildNormalizedScriptMap(scriptMap) {
  const result = {};

  for (const [fromUUID, config] of Object.entries(scriptMap)) {
    const fromLong = normalizeToShort(fromUUID);
    const targetLong = normalizeToShort(config.target);

    result[fromLong] = {
      target: targetLong,
      fieldMap: config.fieldMap || {},
    };
  }

  return result;
}
// ============= 测试代码 =============
// console.log("=== Cocos Creator 2.4.x UUID 转换测试 ===\n");
 const long1 = encodeUuid('e9ec654c-97a2-4787-9325-e6a10375219a');
console.log(`期望长 UUID: ${long1}`);

// console.log("=== 测试 1: 短转长 ===");
// const short1 = "25f8fxwtsZCT7yF0lzyt5zU";
// const long1 = decodeUuid(short1);
// const expected1 = "25f8fc70-b6c6-424f-bc85-d25cf2b79cd4";
// console.log(`输入短 UUID: ${short1}`);
// console.log(`转换为长 UUID: ${long1}`);
// console.log(`期望长 UUID: ${expected1}`);
// console.log(`✓ 匹配: ${long1 === expected1}\n`);

// console.log("=== 测试 2: 长转短 ===");
// const long2 = "8bab7e0c-0380-491c-b66f-b2bef75657c2";
// const short2 = encodeUuid(long2);
// const expected2 = "8bab74MA4BJHLZvsr73VlfC";
// console.log(`输入长 UUID: ${long2}`);
// console.log(`转换为短 UUID: ${short2}`);
// console.log(`期望短 UUID: ${expected2}`);
// console.log(`✓ 匹配: ${short2 === expected2}\n`);

// 导出模块
module.exports = {
  buildNormalizedScriptMap,
  isUUID,
};
