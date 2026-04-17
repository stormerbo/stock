export default function App() {
  return (
    <main className="settings-root">
      <header>
        <p className="eyebrow">Chrome Extension Settings</p>
        <h1>Portfolio Pulse 配置中心</h1>
        <p className="desc">这是从零重建后的设置页基线，后续可在这里接入真实配置存储和行情源管理。</p>
      </header>

      <section className="panel">
        <h2>显示偏好</h2>
        <label>
          <span>涨跌色模式</span>
          <select defaultValue="cn">
            <option value="cn">红涨绿跌</option>
            <option value="us">绿涨红跌</option>
          </select>
        </label>
        <label>
          <span>价格小数位</span>
          <input type="number" defaultValue={2} min={0} max={4} />
        </label>
      </section>

      <section className="panel">
        <h2>刷新策略</h2>
        <label>
          <span>行情刷新间隔（秒）</span>
          <input type="number" defaultValue={10} min={3} max={60} />
        </label>
        <label>
          <span>分时图刷新间隔（秒）</span>
          <input type="number" defaultValue={60} min={10} max={300} />
        </label>
      </section>

      <section className="panel actions">
        <button type="button">保存设置</button>
        <button type="button" className="subtle">恢复默认</button>
      </section>
    </main>
  );
}
