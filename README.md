# 赚钱助手 - 股票持仓管理 Chrome 扩展

基于 React + TypeScript + Vite + Tailwind CSS 开发的股票持仓管理工具。

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **Zustand** - 状态管理
- **React Query** - 数据获取和缓存
- **CRXJS** - Chrome 扩展开发

## 项目结构

```
stock/
├── manifest.json           # 扩展配置
├── package.json            # 依赖配置
├── vite.config.ts          # Vite 配置
├── tailwind.config.js      # Tailwind 配置
├── tsconfig.json           # TypeScript 配置
├── public/                 # 静态资源
│   └── icons/
├── src/
│   ├── types/              # 类型定义
│   ├── utils/              # 工具函数
│   ├── store/              # Zustand Store
│   ├── api/                # API 封装
│   ├── hooks/              # React Query Hooks
│   ├── components/         # 可复用组件
│   │   ├── ui/             # UI 基础组件
│   │   └── modals/         # 弹窗组件
│   ├── popup/              # Popup 页面
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.html
│   │   └── index.css
│   ├── options/            # 设置页面
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.html
│   │   └── index.css
│   └── background/         # Service Worker
│       └── index.ts
```

## 安装依赖

```bash
npm install
```

## 开发

```bash
# 开发模式（带热更新）
npm run dev

# 构建生产版本
npm run build
```

## 安装到 Chrome

1. 运行 `npm run build` 构建项目
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择项目的 `dist` 文件夹

## 功能特性

- ✅ 基于 Tushare Pro 的实时行情
- ✅ React Query 数据缓存和自动刷新
- ✅ Zustand 状态管理
- ✅ TypeScript 类型安全
- ✅ Tailwind CSS 现代化 UI
- ✅ 支持单个/批量添加股票
- ✅ 置顶和多种排序方式
- ✅ 数据导入/导出
- ✅ Chrome Storage 同步

## License

MIT
