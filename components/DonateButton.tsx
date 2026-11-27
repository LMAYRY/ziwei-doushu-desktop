'use client';
// 打赏：每页左下角一个不显眼的小按钮，点开显示微信收款码和一句话；点空白处或「关闭」收起。
import { useEffect, useState } from 'react';

export default function DonateButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="donate-fab no-print" onClick={() => setOpen(true)} aria-haspopup="dialog">
        支持一下
      </button>
      {open && (
        <div className="donate-mask no-print" role="presentation" onClick={() => setOpen(false)}>
          <div className="donate-card" role="dialog" aria-modal="true" aria-label="支持开发" onClick={event => event.stopPropagation()}>
            <p className="donate-text">觉得产品不错可以支持一下～<br />您的支持就是我开发的动力</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/donate-wechat.jpg" alt="微信收款码" width={240} height={327} />
            <button type="button" className="donate-close" onClick={() => setOpen(false)}>关闭</button>
          </div>
        </div>
      )}
    </>
  );
}
