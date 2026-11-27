import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import styles from '../privacy/legal.module.css';

export const metadata = { title: '使用说明 · 紫微斗数', description: '设置 AI、书库、导入书、数据备份和常见问题' };

const code = { fontFamily: 'var(--mono, monospace)', fontSize: '0.9em' } as const;

export default function HelpPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <header className={styles.head}>
          <div className="wrap">
            <p className={styles.eyebrow}>紫微斗数 · 帮助</p>
            <h1 className={styles.h1}>使用说明</h1>
          </div>
        </header>
        <article className="wrap">
          <div className={styles.doc}>
          <h2><span>一</span>功能</h2>
          <p>所有功能都免费：排盘、合盘、大限流年、古籍阅读、书库，以及 AI 单盘解读、合盘解读和追问。AI 解读要先在设置里填你自己的 AI 服务商和 Key。</p>

          <h2><span>二</span>设置 AI</h2>
          <p>AI 解读用的是你自己的 AI 服务商账号，费用由你直接付给服务商（按用量计费，需要先在服务商那里充值）。</p>
          <ul>
          <li><strong>DeepSeek</strong>：在 DeepSeek 开放平台（platform.deepseek.com）注册、充值，然后在「API keys」里创建一个 Key。</li>
          <li><strong>硅基流动</strong>：在硅基流动（cloud.siliconflow.cn）注册，在「API 密钥」里创建 Key。</li>
          <li><strong>其他服务商</strong>：选「其他（OpenAI 兼容）」，填接口地址、模型名和 Key。</li>
          </ul>
          <p>打开 <Link href="/settings">设置</Link>（Mac 快捷键 ⌘,），选服务商、粘贴 Key，先点「测试连接」，提示连接成功后再保存。Key 加密保存在本机，只发给你选的服务商。</p>

          <h2><span>三</span>书库与导入书</h2>
          <ul>
          <li>AI 解读时只查你在 <Link href="/library">古籍库</Link> 页面「书库」里勾选的书库。内置书库是随软件附带的参考书，只供检索、不提供阅读，也可以取消勾选；都不勾时 AI 只按盘面解读。</li>
          <li>可以新建多个自己的书库，选好书库后点「导入 PDF」。有文字的 PDF 直接读取；扫描版会用电脑自带的文字识别，每页约 2 秒，大书需要等一会儿，可以随时取消。</li>
          <li>导入的书只保存在这台电脑上，可以阅读、在书库之间移动或删除；删除只删软件里的副本，不会动你电脑上的原文件。</li>
          <li>Windows 的文字识别只认横排文字，竖排扫描书（多见于繁体古籍和台版书）识别效果很差；扫描版还需要系统装有中文文字识别组件，缺少时软件会提示安装方法。</li>
          </ul>

          <h2><span>四</span>数据保存位置与备份</h2>
          <p>命盘、对话记录、合盘记录、书库和导入的书、AI 设置都保存在这个文件夹：</p>
          <ul>
          <li>Mac：<span style={code}>~/Library/Application Support/紫微斗数</span>（在访达里按 ⇧⌘G，粘贴这个路径前往）</li>
          <li>Windows：<span style={code}>%APPDATA%\紫微斗数</span>（按 Win + R，粘贴这个路径回车）</li>
          </ul>
          <p>备份：先退出软件，再把整个文件夹复制到别处。恢复：退出软件，用备份的文件夹替换原文件夹。换到另一台电脑后，命盘、对话和导入的书都能恢复，但 API Key 需要重新填写（它和原电脑的系统钥匙串绑定）。</p>

          <h2><span>五</span>升级与卸载</h2>
          <ul>
          <li>升级：直接安装新版本覆盖旧版本，数据都会保留。</li>
          <li>卸载：Mac 把「应用程序」里的紫微斗数拖到废纸篓；Windows 在「设置 › 应用」里卸载。卸载不会删除上面的数据文件夹，要彻底清除就手动删掉它。</li>
          </ul>

          <h2><span>六</span>常见问题</h2>
          <p><strong>Mac 提示「无法验证开发者」或「未打开」，打不开？</strong><br />
          本软件没有购买苹果开发者签名。第一次打开时：macOS 15 及以上，先点「完成」，再到「系统设置 › 隐私与安全性」，在页面下方找到「已阻止“紫微斗数”」，点「仍要打开」并输入开机密码；macOS 14 及以下，在「应用程序」里按住 Control 点按紫微斗数，选「打开」，再点「打开」。之后就能正常双击打开。</p>
          <p><strong>Mac 提示「已损坏，无法打开」？</strong><br />
          通常是下载方式给文件加了隔离标记。打开「终端」，粘贴下面这行后回车，再打开软件：<br />
          <span style={code}>xattr -dr com.apple.quarantine /Applications/紫微斗数.app</span></p>
          <p><strong>Windows 提示「Windows 已保护你的电脑」？</strong><br />
          点「更多信息」，再点「仍要运行」。杀毒软件拦截时，选择信任或允许运行。</p>
          <p><strong>升级后 Mac 弹窗问是否允许使用钥匙串里的「紫微斗数 Safe Storage」？</strong><br />
          这是读取加密保存的 API Key，输入开机密码后点「始终允许」。如果点了拒绝，设置页会提示无法读取 Key，重新填写一次即可。</p>
          <p><strong>解读时提示 API Key 错误、余额不足或网络异常？</strong><br />
          分别检查 Key 是否复制完整、服务商账户是否还有余额、网络是否能访问该服务商。设置页的「测试连接」会给出具体原因。</p>
          <p><strong>不知道出生时辰怎么办？</strong><br />
          排盘时勾选「不知道出生时间」，软件以子时起盘。宫位依赖时辰，AI 解读会说明哪些判断因此无法确定。</p>
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
