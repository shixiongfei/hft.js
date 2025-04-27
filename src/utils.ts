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

import { BarData, OrderFlag } from "./typedef.js";
import { BarInfo } from "./bar.js";
import {
  IPlaceOrderResultReceiver,
  IRuntimeEngine,
  IStrategy,
} from "./interfaces.js";

export const isValidPrice = (x: number) => x !== Number.MAX_VALUE && x !== 0;
export const isValidVolume = (x: number) => x !== Number.MAX_VALUE && x !== 0;

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
    const nextBar = bars[i];

    bar.openInterest = nextBar.openInterest;
    bar.closePrice = nextBar.closePrice;

    bar.highPrice = Math.max(bar.highPrice, nextBar.highPrice);
    bar.lowPrice = Math.min(bar.lowPrice, nextBar.lowPrice);

    bar.volume += nextBar.volume;
    bar.amount += nextBar.amount;

    for (const price in nextBar.buyVolumes) {
      const volumeDelta = nextBar.buyVolumes[price];

      if (price in bar.buyVolumes) {
        bar.buyVolumes[price] += volumeDelta;
      } else {
        bar.buyVolumes[price] = volumeDelta;
      }

      bar.delta += volumeDelta;

      const priceVP = bar.buyVolumes[price] + (bar.sellVolumes[price] ?? 0);
      const pocVP = getBarVolume(bar, bar.poc);

      if (priceVP > pocVP) {
        bar.poc = parseFloat(price);
      }
    }

    for (const price in nextBar.sellVolumes) {
      const volumeDelta = nextBar.sellVolumes[price];

      if (price in bar.sellVolumes) {
        bar.sellVolumes[price] += volumeDelta;
      } else {
        bar.sellVolumes[price] = volumeDelta;
      }

      bar.delta -= volumeDelta;

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

export const buyOpen = (
  engine: IRuntimeEngine,
  strategy: IStrategy,
  symbol: string,
  volume: number,
  price: number,
  receiver: IPlaceOrderResultReceiver,
  flag: OrderFlag = "limit",
) =>
  engine.placeOrder(
    strategy,
    symbol,
    "open",
    "long",
    volume,
    price,
    flag,
    receiver,
  );

export const buyClose = (
  engine: IRuntimeEngine,
  strategy: IStrategy,
  symbol: string,
  volume: number,
  price: number,
  isToday: boolean,
  receiver: IPlaceOrderResultReceiver,
  flag: OrderFlag = "limit",
) =>
  engine.placeOrder(
    strategy,
    symbol,
    isToday ? "close-today" : "close",
    "long",
    volume,
    price,
    flag,
    receiver,
  );

export const sellOpen = (
  engine: IRuntimeEngine,
  strategy: IStrategy,
  symbol: string,
  volume: number,
  price: number,
  receiver: IPlaceOrderResultReceiver,
  flag: OrderFlag = "limit",
) =>
  engine.placeOrder(
    strategy,
    symbol,
    "open",
    "short",
    volume,
    price,
    flag,
    receiver,
  );

export const sellClose = (
  engine: IRuntimeEngine,
  strategy: IStrategy,
  symbol: string,
  volume: number,
  price: number,
  isToday: boolean,
  receiver: IPlaceOrderResultReceiver,
  flag: OrderFlag = "limit",
) =>
  engine.placeOrder(
    strategy,
    symbol,
    isToday ? "close-today" : "close",
    "short",
    volume,
    price,
    flag,
    receiver,
  );
