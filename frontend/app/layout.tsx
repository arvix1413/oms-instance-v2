import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OMS 訂單管理系統',
  description: '製造業訂單、BOM、採購管理系統',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}
