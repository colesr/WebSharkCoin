/* factors.js
   Defines every simulated market factor.
   Each slider factor runs -100 (bearish/risk-off end) to +100 (bullish/risk-on end).
   driftWeight: contribution to expected annualized return (signed)
   volWeight:   contribution to annualized volatility when the slider sits away
                from neutral (0). A negative volWeight means moving toward the
                bullish/orderly end of that factor calms the market; positive
                means moving away from neutral (either direction) or toward
                that end excites it. See engine.js for exact math.
*/

const FACTOR_CATEGORIES = [
  { id: "supply",     label: "Supply & Demand" },
  { id: "macro",      label: "Macro & Risk Appetite" },
  { id: "regulatory", label: "Regulatory" },
  { id: "structure",  label: "Market Structure & Liquidity" },
  { id: "tech",       label: "Technology & Fundamentals" },
  { id: "sentiment",  label: "Sentiment & Narrative" },
];

const FACTORS = [
  // --- Supply & Demand ---
  {
    id: "halving_proximity", category: "supply", label: "Halving Proximity",
    lowLabel: "Just passed", highLabel: "Imminent",
    desc: "How close the next scheduled supply-issuance cut is. Markets tend to front-run halvings with anticipatory buying.",
    driftWeight: 0.9, volWeight: 0.1, default: 20,
  },
  {
    id: "staking_lockup", category: "supply", label: "Staking / Lockup Rate",
    lowLabel: "Mostly liquid", highLabel: "Heavily locked",
    desc: "Share of supply staked or otherwise locked up. More locked supply means less available to sell.",
    driftWeight: 0.5, volWeight: -0.1, default: 10,
  },
  {
    id: "token_burn", category: "supply", label: "Token Burn Rate",
    lowLabel: "No burning", highLabel: "Aggressive burn",
    desc: "Rate at which tokens are permanently destroyed, shrinking effective circulating supply.",
    driftWeight: 0.4, volWeight: 0.0, default: 0,
  },
  {
    id: "exchange_netflow", category: "supply", label: "Exchange Net Flow",
    lowLabel: "Net outflow (to cold storage)", highLabel: "Net inflow (to exchanges)",
    desc: "Coins moving onto exchanges are usually headed for sale; coins moving off are usually headed for storage.",
    driftWeight: -0.7, volWeight: 0.2, default: -5,
  },

  // --- Macro & Risk Appetite ---
  {
    id: "interest_rates", category: "macro", label: "Interest Rate Trajectory",
    lowLabel: "Aggressive hikes", highLabel: "Aggressive cuts",
    desc: "Tightening policy pulls liquidity out of speculative assets; easing policy pushes it back in.",
    driftWeight: 0.8, volWeight: 0.1, default: 0,
  },
  {
    id: "inflation_expectations", category: "macro", label: "Inflation Expectations",
    lowLabel: "Low / falling", highLabel: "High / rising",
    desc: "Rising inflation expectations can feed a 'digital gold' hedge narrative, but can also spook risk assets broadly.",
    driftWeight: 0.4, volWeight: 0.2, default: 0,
  },
  {
    id: "dollar_strength", category: "macro", label: "US Dollar Strength",
    lowLabel: "Weak dollar", highLabel: "Strong dollar",
    desc: "A strong dollar historically pressures crypto and other dollar-denominated risk assets lower.",
    driftWeight: -0.6, volWeight: 0.0, default: 0,
  },
  {
    id: "risk_appetite", category: "macro", label: "Risk Appetite / Equity Correlation",
    lowLabel: "Risk-off", highLabel: "Risk-on",
    desc: "Crypto often trades like a high-beta tech asset during broad risk-on or risk-off swings.",
    driftWeight: 0.9, volWeight: 0.3, default: 10,
  },

  // --- Regulatory ---
  {
    id: "reg_clarity", category: "regulatory", label: "Regulatory Clarity",
    lowLabel: "Crackdown / ambiguity", highLabel: "Clear, friendly rules",
    desc: "Clear rules lower the perceived tail risk of holding the asset; ambiguity or crackdowns raise it.",
    driftWeight: 0.8, volWeight: -0.4, default: 0,
  },
  {
    id: "etf_flows", category: "regulatory", label: "ETF Flows",
    lowLabel: "Sustained outflows", highLabel: "Sustained inflows",
    desc: "Spot ETF creation and redemption activity is now one of the most closely watched demand signals.",
    driftWeight: 0.9, volWeight: 0.1, default: 5,
  },
  {
    id: "stablecoin_stress", category: "regulatory", label: "Stablecoin Regulatory Stress",
    lowLabel: "High stress / depeg risk", highLabel: "Well regulated & trusted",
    desc: "Stablecoins are the market's plumbing; doubt about their backing or legality ripples through everything.",
    driftWeight: 0.5, volWeight: -0.3, default: 10,
  },

  // --- Market Structure & Liquidity ---
  {
    id: "liquidity_depth", category: "structure", label: "Order Book Liquidity Depth",
    lowLabel: "Thin", highLabel: "Deep",
    desc: "Thin order books mean the same dollar of buying or selling moves price much further.",
    driftWeight: 0.1, volWeight: -0.6, default: 0,
  },
  {
    id: "leverage", category: "structure", label: "Derivatives Leverage / Open Interest",
    lowLabel: "Low leverage", highLabel: "Extreme leverage",
    desc: "Crowded, highly levered positioning sets up cascading liquidations in either direction.",
    driftWeight: 0.0, volWeight: 0.7, default: 15,
  },
  {
    id: "whale_concentration", category: "structure", label: "Whale Concentration",
    lowLabel: "Widely distributed", highLabel: "Highly concentrated",
    desc: "When a small number of wallets hold a large share of supply, their individual moves can swing the market.",
    driftWeight: -0.2, volWeight: 0.5, default: 10,
  },
  {
    id: "exchange_trust", category: "structure", label: "Exchange Reliability & Trust",
    lowLabel: "Recent failures", highLabel: "High trust",
    desc: "Confidence that exchanges and custodians will honor withdrawals underpins willingness to hold on-platform.",
    driftWeight: 0.5, volWeight: -0.4, default: 10,
  },

  // --- Technology & Fundamentals ---
  {
    id: "network_upgrades", category: "tech", label: "Network Upgrade Momentum",
    lowLabel: "Stalled roadmap", highLabel: "Strong upgrade momentum",
    desc: "Successful upgrades (throughput, fees, security) support long-run fundamental demand.",
    driftWeight: 0.5, volWeight: -0.1, default: 10,
  },
  {
    id: "security_incidents", category: "tech", label: "Security Incident Severity",
    lowLabel: "Severe recent hack", highLabel: "Clean track record",
    desc: "Exploits, bridge failures, and hacks damage confidence in proportion to their size and recency.",
    driftWeight: 0.6, volWeight: -0.3, default: 15,
  },
  {
    id: "dev_activity", category: "tech", label: "Developer Activity",
    lowLabel: "Shrinking", highLabel: "Growing",
    desc: "Active development and shipping cadence are a slow-moving proxy for long-term project health.",
    driftWeight: 0.4, volWeight: -0.1, default: 10,
  },
  {
    id: "chain_rotation", category: "tech", label: "Competing Chain Rotation",
    lowLabel: "Losing share", highLabel: "Gaining share",
    desc: "Capital and attention rotate between competing chains and narratives over time.",
    driftWeight: 0.3, volWeight: 0.1, default: 0,
  },

  // --- Sentiment & Narrative ---
  {
    id: "social_buzz", category: "sentiment", label: "Social Media Buzz",
    lowLabel: "Quiet", highLabel: "Frenzied",
    desc: "Elevated chatter can precede both euphoric rallies and crowded, fragile tops.",
    driftWeight: 0.3, volWeight: 0.4, default: 10,
  },
  {
    id: "fear_greed", category: "sentiment", label: "Fear & Greed Index",
    lowLabel: "Extreme fear", highLabel: "Extreme greed",
    desc: "A classic contrarian-adjacent gauge of crowd emotion; extremes in either direction tend to be unstable.",
    driftWeight: 0.6, volWeight: 0.3, default: 10,
  },
  {
    id: "news_tone", category: "sentiment", label: "News Cycle Tone",
    lowLabel: "Hostile coverage", highLabel: "Favorable coverage",
    desc: "The tone of mainstream and financial press coverage shapes retail and institutional appetite alike.",
    driftWeight: 0.5, volWeight: 0.2, default: 5,
  },
];

/* One-off event catalysts: applied as an immediate price jump plus a
   temporary volatility spike that decays over DECAY_DAYS. */
const CATALYSTS = [
  {
    id: "etf_approval", label: "ETF Approval", group: "bullish",
    desc: "A major spot ETF is approved.",
    shock: 0.18, volSpike: 0.6, decayDays: 25,
  },
  {
    id: "halving_event", label: "Halving Event", group: "bullish",
    desc: "A scheduled issuance halving occurs.",
    shock: 0.08, volSpike: 0.2, decayDays: 40,
  },
  {
    id: "exchange_collapse", label: "Exchange Collapse", group: "bearish",
    desc: "A major exchange or lender fails.",
    shock: -0.30, volSpike: 1.2, decayDays: 35,
  },
  {
    id: "security_breach", label: "Security Breach", group: "bearish",
    desc: "A protocol or bridge is exploited.",
    shock: -0.12, volSpike: 0.5, decayDays: 15,
  },
  {
    id: "regulatory_crackdown", label: "Regulatory Crackdown", group: "bearish",
    desc: "A major regulator moves aggressively against the asset.",
    shock: -0.20, volSpike: 0.5, decayDays: 30,
  },
];

const ASSETS = [
  { id: "btc", label: "BTC", name: "Bitcoin", startPrice: 111000, baseAnnualVol: 0.55 },
  { id: "eth", label: "ETH", name: "Ethereum", startPrice: 4600, baseAnnualVol: 0.70 },
  { id: "sol", label: "SOL", name: "Solana", startPrice: 210, baseAnnualVol: 0.95 },
];
