// data.js — fetch live price data from CoinGecko and helpers

const COINGECKO_IDS = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
};

async function fetchCurrentPrice(assetId) {
  const id = COINGECKO_IDS[assetId] || assetId;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`);
    if (!res.ok) throw new Error('network');
    const data = await res.json();
    if (!data || !data[id] || !data[id].usd) return null;
    return data[id].usd;
  } catch (err) {
    console.warn('fetchCurrentPrice error', err);
    return null;
  }
}
