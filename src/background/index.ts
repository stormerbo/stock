import { getSettings } from '@/utils/storage';

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('Stock Tracker 已安装');
  initAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Stock Tracker 已启动');
  initAlarm();
});

// 初始化定时器
async function initAlarm() {
  const settings = await getSettings();
  const interval = Math.max(5, settings.refreshInterval || 10);

  // 清除旧的 alarm
  await chrome.alarms.clear('refresh-quotes');

  // 创建新的 alarm
  chrome.alarms.create('refresh-quotes', {
    periodInMinutes: interval / 60,
  });

  console.log(`定时刷新已启动: ${interval}秒`);
}

// 监听 alarm
chrome.alarms.onAlarm.addListener((alarm: { name: string }) => {
  if (alarm.name === 'refresh-quotes') {
    refreshQuotes();
  }
});

// 刷新行情数据
async function refreshQuotes() {
  try {
    // 向所有打开的 popup 发送刷新消息
    chrome.runtime.sendMessage({ action: 'refresh' });
  } catch (error) {
    // 如果没有 popup 打开，会报错，忽略即可
  }
}

// 监听消息
chrome.runtime.onMessage.addListener((message: { action: string; settings?: { refreshInterval?: number } }) => {
  if (message.action === 'startAlarm') {
    initAlarm();
  } else if (message.action === 'updateSettings') {
    if (message.settings?.refreshInterval) {
      initAlarm();
    }
  }
  return true;
});

console.log('Stock Tracker Background Script 已加载');
