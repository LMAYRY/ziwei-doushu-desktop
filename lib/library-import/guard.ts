// The import API writes into the user's data directory, so only the app's own pages may call it.
// - Desktop pages come through ziwei://app, whose handler strips Origin (electron/main.js).
// - A page on another site could still reach 127.0.0.1:<port>, but its requests carry an Origin
//   (and Sec-Fetch-Site: cross-site), and the custom header forces a CORS preflight we never allow.

export const LIBRARY_HEADER = 'x-ziwei-library';

/**
 * 桌面版、`next dev`，以及在自己电脑上运行的网页版（.env.local 里写 ZIWEI_SELF_HOSTED=1）。
 * 公开部署给别人用的网站不要打开：导入的书会写进服务器，所有访问者共用。
 */
export function importAvailable() {
  return process.env.ZIWEI_DESKTOP === '1' || process.env.ZIWEI_SELF_HOSTED === '1' || process.env.NODE_ENV === 'development';
}

export function rejectForeign(request: Request): Response | null {
  if (!importAvailable()) return Response.json({ error: '只有桌面版或本机自用的网页版可以管理书库' }, { status: 404 });
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  const sameOrigin = !origin || origin === new URL(request.url).origin;
  if (request.headers.get(LIBRARY_HEADER) !== '1' || !sameOrigin || (site && site !== 'same-origin')) {
    return Response.json({ error: '不允许的来源' }, { status: 403 });
  }
  return null;
}
