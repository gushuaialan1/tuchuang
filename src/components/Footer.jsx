import Link from 'next/link';

const toolLinks = [
  { href: 'https://pdf.82314912.xyz/', label: 'PDF 合并与压缩' },
  { href: 'https://img.82314912.xyz/', label: '图片压缩工具' },
  { href: 'https://audio.82314912.xyz/', label: '音频格式转换' },
  { href: 'https://uuid.82314912.xyz/', label: 'UUID 生成器' },
  { href: 'https://text.82314912.xyz/', label: '文字风格转换' },
];

export default function Footer() {
  return (
    <footer className="w-full text-center bg-slate-200 flex flex-col justify-center items-center py-3">
      <div>
        <p className="text-xs text-gray-500">
          Copyright Ⓒ 2024 All rights reserved. 请勿上传违反中国法律的图片，违者后果自负。
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {toolLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-xs text-gray-400 hover:text-gray-600 hover:underline decoration-dotted"
            target="_blank"
            rel="noopener noreferrer"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </footer>
  );
}
