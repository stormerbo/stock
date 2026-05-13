import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3, Bell, PieChart, Search, Settings, SlidersHorizontal,
  WalletCards, FileText, Star, Pin, ArrowRight,
  Check, X,
} from 'lucide-react';

const DEMO_STORAGE_KEY = 'demoCompleted';

type StepContent = {
  title: string;
  description: string;
  element: React.ReactNode;
};

const FEATURES = [
  {
    icon: <BarChart3 size={20} />,
    label: '股票监控',
    desc: '实时行情、分时图、涨跌幅、盈亏一目了然',
  },
  {
    icon: <WalletCards size={20} />,
    label: '基金持仓',
    desc: '净值披露状态、持有收益、估算收益跟踪',
  },
  {
    icon: <PieChart size={20} />,
    label: '账户总览',
    desc: '资产配置比例、综合收益快照、持仓分布',
  },
  {
    icon: <Search size={20} />,
    label: '快速搜索',
    desc: '搜索股票/基金代码或名称，一键加入自选',
  },
  {
    icon: <Bell size={20} />,
    label: '智能告警',
    desc: '目标价、涨跌幅、急速异动、移动止盈等多种规则',
  },
  {
    icon: <SlidersHorizontal size={20} />,
    label: '内联编辑',
    desc: '直接在列表中编辑成本价、持仓数量，即时计算盈亏',
  },
  {
    icon: <Pin size={20} />,
    label: '置顶与标签',
    desc: '钉住重要股票、自定义标签分组管理',
  },
  {
    icon: <FileText size={20} />,
    label: '盘后技术报告',
    desc: 'MACD、RSI、KDJ 等技术指标每日收盘分析',
  },
];

const STEPS: StepContent[] = [
  {
    title: '欢迎使用赚钱助手',
    description: '你的 A 股股票 & 基金持仓管理小帮手',
    element: (
      <div className="demo-welcome">
        <div className="demo-logo">
          <span className="demo-logo-icon">🤑</span>
        </div>
        <p className="demo-welcome-subtitle">
          实时行情 · 智能告警 · 技术分析
        </p>
        <p className="demo-welcome-desc">
          一站式管理你的投资组合，不错过每一个买卖时机
        </p>
      </div>
    ),
  },
  {
    title: '核心功能一览',
    description: '快速了解赚钱助手能为你做什么',
    element: (
      <div className="demo-features">
        {FEATURES.map((f) => (
          <div key={f.label} className="demo-feature-card">
            <span className="demo-feature-icon">{f.icon}</span>
            <div className="demo-feature-text">
              <strong>{f.label}</strong>
              <span>{f.desc}</span>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: '快速上手',
    description: '三步开始使用',
    element: (
      <div className="demo-tips">
        <div className="demo-tip">
          <span className="demo-tip-num">1</span>
          <div className="demo-tip-text">
            <strong>添加自选</strong>
            <span>点击右上角 <Search size={12} /> 搜索按钮，输入股票/基金代码或名称添加</span>
          </div>
        </div>
        <div className="demo-tip">
          <span className="demo-tip-num">2</span>
          <div className="demo-tip-text">
            <strong>编辑持仓</strong>
            <span>点击列表中的成本价或股数，输入你的实际持仓信息</span>
          </div>
        </div>
        <div className="demo-tip">
          <span className="demo-tip-num">3</span>
          <div className="demo-tip-text">
            <strong>设置告警</strong>
            <span>在 <Settings size={12} /> 设置页中配置价格告警，实时接收通知</span>
          </div>
        </div>
        <div className="demo-tip-notice">
          <Star size={14} />
          <span>提示：右键点击自选股可打开更多操作菜单</span>
        </div>
      </div>
    ),
  },
];

export async function loadDemoFlag(): Promise<boolean> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    const result = await chrome.storage.sync.get(DEMO_STORAGE_KEY);
    return result[DEMO_STORAGE_KEY] === true;
  }
  try {
    return localStorage.getItem(DEMO_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

async function saveDemoFlag(): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    await chrome.storage.sync.set({ [DEMO_STORAGE_KEY]: true });
    return;
  }
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, 'true');
  } catch {
    // ignore
  }
}

type DemoGuideProps = {
  onComplete: () => void;
};

export default function DemoGuide({ onComplete }: DemoGuideProps) {
  const [step, setStep] = useState(0);
  const total = STEPS.length;

  const handleNext = useCallback(() => {
    if (step < total - 1) {
      setStep((s) => s + 1);
    }
  }, [step, total]);

  const handlePrev = useCallback(() => {
    if (step > 0) {
      setStep((s) => s - 1);
    }
  }, [step]);

  const handleFinish = useCallback(() => {
    void saveDemoFlag().then(onComplete);
  }, [onComplete]);

  const handleSkip = useCallback(() => {
    void saveDemoFlag().then(onComplete);
  }, [onComplete]);

  // 键盘导航
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (step < total - 1) handleNext();
        else handleFinish();
      } else if (e.key === 'ArrowLeft' && step > 0) {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        handleFinish();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, total, handleNext, handlePrev, handleFinish]);

  const current = STEPS[step];

  return (
    <div className="demo-overlay">
      <div className="demo-modal">
        {/* 头部 */}
        <div className="demo-header">
          <div className="demo-step-indicator">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`demo-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
              />
            ))}
          </div>
          <button
            type="button"
            className="demo-skip-btn"
            onClick={handleSkip}
            aria-label="跳过引导"
          >
            <X size={14} />
          </button>
        </div>

        {/* 内容 */}
        <div className="demo-body">
          <h2 className="demo-step-title">{current.title}</h2>
          <p className="demo-step-desc">{current.description}</p>
          <div className="demo-step-content">
            {current.element}
          </div>
        </div>

        {/* 底部 */}
        <div className="demo-footer">
          <div className="demo-footer-left">
            {step > 0 ? (
              <button type="button" className="demo-btn-secondary" onClick={handlePrev}>
                上一步
              </button>
            ) : null}
          </div>
          <div className="demo-footer-right">
            {step < total - 1 ? (
              <button type="button" className="demo-btn-primary" onClick={handleNext}>
                下一步 <ArrowRight size={14} />
              </button>
            ) : (
              <button type="button" className="demo-btn-primary" onClick={handleFinish}>
                <Check size={14} /> 开始使用
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
