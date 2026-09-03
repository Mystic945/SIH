const c = {
  reset: '\x1b[0m', gray: '\x1b[90m', red: '\x1b[31m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const stamp = () => new Date().toISOString().slice(11, 19);
const line = (color, tag, msg) =>
  console.log(`${c.gray}${stamp()}${c.reset} ${color}${tag}${c.reset} ${msg}`);

export const logger = {
  info: (m) => line(c.cyan, '[info]', m),
  success: (m) => line(c.green, '[ ok ]', m),
  warn: (m) => line(c.yellow, '[warn]', m),
  error: (m) => line(c.red, '[err ]', m),
  sms: (m) => line(c.yellow, '[sms ]', m),
};
