import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import styles from '../privacy/legal.module.css';

export const metadata = { title: '隐私政策 · 紫微斗数', description: '紫微斗数桌面版隐私政策' };

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <header className={styles.head}>
          <div className="wrap">
            <p className={styles.eyebrow}>紫微斗数 · 条款</p>
            <h1 className={styles.h1}>隐私政策</h1>
            <p className={styles.updated}>最后更新：二〇二六年十一月</p>
          </div>
        </header>
        <article className="wrap">
          <div className={styles.doc}>
          <p className={styles.notice}>本软件没有账号系统，也没有我们自己的服务器保存你的命盘。数据都在你自己的电脑上，只有 AI 解读时会联网发送数据。</p>

          <h2><span>一</span>保存在你电脑上的数据</h2>
          <ul>
          <li><strong>命盘和对话记录</strong>：你输入的出生信息、排出的命盘、解读和追问记录、合盘记录</li>
          <li><strong>AI 设置</strong>：服务商、模型和 API Key。Key 用系统钥匙串（Mac）或系统数据保护（Windows）加密后保存</li>
          <li><strong>书库</strong>：你建的书库、导入的 PDF 提取出的文字和检索索引</li>
          </ul>
          <p>这些数据存放在：Mac 为「~/Library/Application Support/紫微斗数」，Windows 为「%APPDATA%\紫微斗数」。卸载软件不会删除这个文件夹，需要彻底清除时手动删掉即可。</p>

          <h2><span>二</span>AI 解读时发给你所选的 AI 服务商</h2>
          <p>使用 AI 解读、合盘解读和追问时，本软件把以下内容直接发给你在设置里选的 AI 服务商（例如 DeepSeek、硅基流动），用你自己的 API Key 调用：</p>
          <ul>
          <li>命盘数据（星曜、宫位、四化、大限流年等）和出生日期、时辰、性别</li>
          <li>你的提问和本次对话的上文</li>
          <li>从书籍中检索到的相关段落</li>
          </ul>
          <p>这些请求不经过我们的服务器，我们看不到内容。服务商如何处理这些数据，以该服务商的隐私政策为准。命盘里填的姓名只用于界面显示。</p>

          <h2><span>三</span>不收集的内容</h2>
          <ul>
          <li>不做使用统计，不装广告或第三方追踪</li>
          <li>不上传你的命盘、对话、导入的书或电脑上的其他文件</li>
          </ul>

          <h2><span>四</span>未成年人</h2>
          <p>本软件的命理内容面向成年用户。未成年人请在监护人同意下使用。</p>

          <h2><span>五</span>政策变更</h2>
          <p>本政策随软件版本更新，以你所用版本里的内容为准。</p>
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
