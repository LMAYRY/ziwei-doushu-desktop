// electron-builder afterPack hook: copy the Next server and bundled data into the app's resources
// (Mac: 紫微斗数.app/Contents/Resources, Windows: resources/ next to 紫微斗数.exe). Done here instead
// of `extraResources`, which silently drops node_modules and does not keep Turbopack's relative symlinks.
const { cpSync, existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync } = require('node:fs');
const path = require('node:path');

/** Replace every symlink under `directory` with a real copy of what it points to (cpSync's
 *  `dereference` only applies to the top level, nested links stay links). */
function materializeSymlinks(directory) {
  for (const name of readdirSync(directory)) {
    const entry = path.join(directory, name);
    const stat = lstatSync(entry);
    if (stat.isSymbolicLink()) {
      const real = realpathSync(entry);
      rmSync(entry, { force: true });
      cpSync(real, entry, { recursive: true, dereference: true });
      materializeSymlinks(entry);
    } else if (stat.isDirectory()) {
      materializeSymlinks(entry);
    }
  }
}

exports.default = async function afterPack(context) {
  const dist = path.join(context.packager.projectDir, 'dist-desktop');
  const platform = context.electronPlatformName; // 'darwin' | 'win32'
  const built = JSON.parse(readFileSync(path.join(dist, 'target.json'), 'utf8'));
  if (built.platform !== platform) {
    throw new Error(`dist-desktop 是为 ${built.platform} 构建的，现在要打 ${platform} 的包：先运行对应平台的 desktop:build`);
  }
  const resources = platform === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  for (const [from, to] of [['server', 'server'], ['resources', 'data']]) {
    const source = path.join(dist, from);
    if (!existsSync(source)) throw new Error(`${source} 不存在，先运行 npm run desktop:build`);
    const target = path.join(resources, to);
    rmSync(target, { recursive: true, force: true });
    // Mac keeps Turbopack's relative symlinks; the Windows installer cannot hold symlinks, so copy their targets.
    if (platform === 'darwin') cpSync(source, target, { recursive: true, verbatimSymlinks: true });
    else {
      cpSync(source, target, { recursive: true, dereference: true });
      materializeSymlinks(target);
    }
  }
  const arch = platform === 'darwin' ? 'arm64' : 'x64';
  if (!existsSync(path.join(resources, 'server', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v3', platform, arch, 'onnxruntime_binding.node'))) {
    throw new Error('打包后的 server 缺少 onnxruntime-node 原生文件');
  }
};
