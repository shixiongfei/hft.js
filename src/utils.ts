/*
 * utils.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/hft.js
 */

import { BarData } from "./typedef.js";
import { BarInfo } from "./bar.js";

export const parseSymbol = (symbol: string): [string, string] => {
  const [instrumentId, exchangeId] = symbol.split(".");
  return [instrumentId, exchangeId];
};

export const getBarBuyVolume = (bar: BarData, price: number) =>
  bar.buyVolumes[price] ?? 0;

export const getBarSellVolume = (bar: BarData, price: number) =>
  bar.sellVolumes[price] ?? 0;

export const getBarVolume = (bar: BarData, price: number) =>
  getBarBuyVolume(bar, price) + getBarSellVolume(bar, price);

export const mergeBarData = (bars: BarData[]): BarData => {
  if (bars.length === 0) {
    throw new Error("Bars is empty");
  }

  if (bars.length === 1) {
    return bars[1];
  }

  const bar: BarInfo = {
    symbol: bars[0].symbol,
    date: bars[0].date,
    time: bars[0].time,
    openInterest: bars[0].openInterest,
    openPrice: bars[0].openPrice,
    highPrice: bars[0].highPrice,
    lowPrice: bars[0].lowPrice,
    closePrice: bars[0].closePrice,
    volume: bars[0].volume,
    amount: bars[0].volume,
    delta: bars[0].delta,
    poc: bars[0].poc,
    buyVolumes: { ...bars[0].buyVolumes },
    sellVolumes: { ...bars[0].sellVolumes },
  };

  for (let i = 1; i < bars.length; ++i) {
    bar.openInterest = bars[i].openInterest;
    bar.closePrice = bars[i].closePrice;

    bar.highPrice = Math.max(bar.highPrice, bars[i].highPrice);
    bar.lowPrice = Math.min(bar.lowPrice, bars[i].lowPrice);

    bar.volume += bars[i].volume;
    bar.amount += bars[i].amount;

    for (const price in bars[i].buyVolumes) {
      if (price in bar.buyVolumes) {
        bar.buyVolumes[price] += bars[i].buyVolumes[price];
      } else {
        bar.buyVolumes[price] = bars[i].buyVolumes[price];
      }

      bar.delta += bars[i].buyVolumes[price];

      const priceVP = bar.buyVolumes[price] + (bar.sellVolumes[price] ?? 0);
      const pocVP = getBarVolume(bar, bar.poc);

      if (priceVP > pocVP) {
        bar.poc = parseFloat(price);
      }
    }

    for (const price in bars[i].sellVolumes) {
      if (price in bar.sellVolumes) {
        bar.sellVolumes[price] += bars[i].sellVolumes[price];
      } else {
        bar.sellVolumes[price] = bars[i].sellVolumes[price];
      }

      bar.delta -= bars[i].sellVolumes[price];

      const priceVP = bar.sellVolumes[price] + (bar.buyVolumes[price] ?? 0);
      const pocVP = getBarVolume(bar, bar.poc);

      if (priceVP > pocVP) {
        bar.poc = parseFloat(price);
      }
    }
  }

  Object.freeze(bar.buyVolumes);
  Object.freeze(bar.sellVolumes);

  return Object.freeze(bar);
};
