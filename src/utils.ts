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
  }

  Object.freeze(bar.buyVolumes);
  Object.freeze(bar.sellVolumes);

  return Object.freeze(bar);
};
