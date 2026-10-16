import type { Market, Workspace } from './types';
import { buildReport } from './research.ts';

const DEMO_NOW = '2026-10-12T06:00:00.000Z';

function blankWorkspace(user: string): Workspace {
  return {
    version: 1,
    mode: 'live',
    markets: [],
    alerts: [],
    settings: { thresholdPp: 5, pollSeconds: 120 },
    account: { startingBalance: 100, cash: 100, feeRate: 0.01, maxTrade: 10, positions: [] },
    health: { status: 'idle', message: '等待添加真实市场。尚未连接实时行情。', checkedAt: null },
    user,
  };
}

export function createLiveWorkspace(user: string): Workspace {
  return blankWorkspace(user);
}

const fixtures = [
  { slug: 'demo-northport-election', question: '【示例】北港市绿叶党能否赢得市长选举？', category: '政治', p: 0.62, delta: 6.2, volume: 1248000, liquidity: 186000, ends: '2026-11-04T23:59:59Z', rule: '只有虚构的北港市选举委员会在 2026 年 11 月 4 日 23:59:59 UTC 前正式宣布绿叶党候选人当选市长，才结算为 YES；否则为 NO。退出、媒体预测与非正式计票均不算正式宣布。', source: '示例来源：虚构的北港市选举委员会公告（无真实机构或链接）' },
  { slug: 'demo-harbor-rate', question: '【示例】海湾央行将在 11 月会议下调利率吗？', category: '经济', p: 0.38, delta: -4.1, volume: 962000, liquidity: 142000, ends: '2026-11-12T18:00:00Z', rule: '虚构的海湾央行在 2026 年 11 月 12 日例行会议发布的目标政策利率低于会议前的利率，则为 YES。临时会议、口头暗示与其他工具调整不计入。', source: '示例来源：虚构的海湾央行政策决议（无真实机构或链接）' },
  { slug: 'demo-moonlight-launch', question: '【示例】月光科技将在年底前公开发布新芯片吗？', category: '科技', p: 0.74, delta: 2.8, volume: 486000, liquidity: 83000, ends: '2026-12-31T23:59:59Z', rule: '虚构的月光科技须在 2026 年 12 月 31 日 23:59:59 UTC 前发布官方公告，并对公众提供命名为 M3 的芯片产品规格。传闻、泄露样片或仅展示概念不符合。', source: '示例来源：虚构的月光科技产品公告（无真实机构或链接）' },
  { slug: 'demo-river-budget', question: '【示例】临江市交通预算案将在本月通过吗？', category: '政治', p: 0.51, delta: 0.9, volume: 328000, liquidity: 62000, ends: '2026-10-31T23:59:59Z', rule: '虚构的临江市议会须在 2026 年 10 月 31 日 23:59:59 UTC 前完成交通预算案的最终表决并在正式会议记录中记为通过。委员会通过或初读不算。', source: '示例来源：虚构的临江市议会最终表决记录（无真实机构或链接）' },
  { slug: 'demo-island-train', question: '【示例】青屿城际列车将在 12 月开始运营吗？', category: '其他', p: 0.29, delta: -7.4, volume: 174000, liquidity: 36000, ends: '2026-12-31T23:59:59Z', rule: '虚构的青屿城际列车须在 2026 年 12 月 31 日 23:59:59 UTC 前开行首班面向公众售票的常规商业班次。空载试运行、邀请体验或竣工仪式不计入。', source: '示例来源：虚构的青屿交通署运营公告（无真实机构或链接）' },
  { slug: 'demo-southbay-cpi', question: '【示例】南湾共和国 11 月 CPI 同比将低于 3% 吗？', category: '经济', p: 0.46, delta: 1.5, volume: 612000, liquidity: 91000, ends: '2026-12-15T12:00:00Z', rule: '以虚构的南湾共和国统计局首次公布的 2026 年 11 月整体 CPI 同比增速为准；严格小于 3.0% 才为 YES，等于 3.0% 为 NO。核心 CPI、修订值与预测不计入。', source: '示例来源：虚构的南湾共和国统计局初次发布值（无真实机构或链接）' },
];

export function createDemoWorkspace(user: string): Workspace {
  const workspace = blankWorkspace(user);
  const markets: Market[] = fixtures.map((fixture, index) => {
    const baseline = fixture.p - fixture.delta / 100;
    const history = Array.from({ length: 29 }, (_, step) => {
      const progress = step / 28;
      const wave = Math.sin(step * 1.19 + index) * Math.sin(progress * Math.PI) * 0.018;
      return {
        at: new Date(Date.parse(DEMO_NOW) - (28 - step) * 6 * 60 * 60 * 1000).toISOString(),
        p: Math.round(Math.max(0.01, Math.min(0.99, baseline + (fixture.p - baseline) * progress + wave)) * 10000) / 10000,
      };
    });
    return {
      id: fixture.slug,
      slug: fixture.slug,
      question: fixture.question,
      category: fixture.category,
      rules: fixture.rule,
      resolutionSource: fixture.source,
      probability: fixture.p,
      changePp: fixture.delta,
      volume: fixture.volume,
      liquidity: fixture.liquidity,
      updatedAt: DEMO_NOW,
      endsAt: fixture.ends,
      status: 'active',
      synthetic: true,
      watched: index < 3,
      history,
      evidence: [],
      reports: [],
      baseline,
      ruleHash: `demo-rules-${index}-v1`,
    };
  });
  markets[0].reports = [buildReport(markets[0], '2026-10-12T05:30:00.000Z')];
  markets[1].reports = [buildReport(markets[1], '2026-10-12T04:00:00.000Z')];
  return {
    ...workspace,
    mode: 'demo',
    markets,
    alerts: [
      { id: 'demo-alert-1', marketId: markets[0].id, title: '【示例】概率累计变化超过阈值', message: '北港市选举的示例概率从基线 55.8% 上升至 62.0%，累计 +6.2 个百分点。这是示例提醒，不是实际新闻或交易信号。', kind: 'price', createdAt: DEMO_NOW, read: false },
      { id: 'demo-alert-2', marketId: markets[1].id, title: '【示例】研究材料仍待补充', message: '海湾央行事件尚未添加一手证据。请使用右侧证据面板练习记录来源与反证。', kind: 'quality', createdAt: '2026-10-12T04:00:00.000Z', read: false },
    ],
    health: { status: 'demo', message: '正在使用虚构教学数据；市场、图表与提醒均为示例。账户是 $100 模拟余额，没有真实资金。', checkedAt: DEMO_NOW },
  };
}
