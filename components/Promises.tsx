'use client';
import { Icon } from './Icons';

export default function Promises({ partner, onDone }: { partner: string; onDone: () => void }) {
  return (
    <div className="app">
      <header className="top">
        <div className="brandrow">
          <div>
            <h1 className="wordmark">之间</h1>
            <div className="tagline">两个人之间，需要一个不站队的翻译者。</div>
          </div>
        </div>
        <div style={{ height: 14 }} />
      </header>
      <main>
        <div className="onb">
          <div className="step">连上了</div>
          <h2>开始之前，有三件事想先讲清楚</h2>

          <div className="promise">{Icon.lock}<div>
            <div className="pt">日记是你一个人的</div>
            <div className="pd">
              AI 会读它，用来理解你是个怎样的人。但{partner}永远看不到里面的任何一句原话，一句都不行 ——
              这不是我们的自觉，是数据库里写死的规则，{partner}的账号去查会直接被拒绝。
            </div>
          </div></div>

          <div className="promise">{Icon.two}<div>
            <div className="pt">共同沟通是你们两个人的</div>
            <div className="pd">AI 会读，因为它需要知道发生了什么。但它不会在那里出现、不会插话、更不会评理谁对谁错。</div>
          </div></div>

          <div className="promise">{Icon.send}<div>
            <div className="pt">发送这个动作，永远由你来做</div>
            <div className="pd">AI 可以帮你把一句话换个说法，但它不会替你按下发送。每一句要去到{partner}那里的话，都要经过你点头。</div>
          </div></div>

          <button className="btn me" style={{ marginTop: 24 }} onClick={onDone}>我知道了，开始</button>
        </div>
      </main>
    </div>
  );
}
