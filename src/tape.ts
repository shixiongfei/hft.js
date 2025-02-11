/*
 * tape.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/hft-js/hft.js
 */

import {
  TapeData,
  TapeDirection,
  TapeStatus,
  TapeType,
  TickData,
} from "./typedef.js";

const calcTapeType = (volumeDelta: number, interestDelta: number): TapeType => {
  if (interestDelta > 0) {
    return volumeDelta === interestDelta ? "dual-open" : "open";
  }

  if (interestDelta < 0) {
    return volumeDelta + interestDelta === 0 ? "dual-close" : "close";
  }

  if (volumeDelta > 0) {
    return "turnover";
  }

  return "no-deal";
};

const calcTapeDirection = (
  tick: TickData,
  preTick?: TickData,
): TapeDirection => {
  const lastPrice = tick.lastPrice;

  if (preTick) {
    const preAskPrice1 = preTick.orderBook.asks.price[0] ?? Number.MAX_VALUE;

    if (lastPrice >= preAskPrice1) {
      return "up";
    }

    const preBidPrice1 = preTick.orderBook.bids.price[0] ?? Number.MIN_VALUE;

    if (lastPrice <= preBidPrice1) {
      return "down";
    }

    const askPrice1 = tick.orderBook.asks.price[0] ?? Number.MAX_VALUE;

    if (lastPrice >= askPrice1) {
      return "up";
    }

    const bidPrice1 = tick.orderBook.bids.price[0] ?? Number.MIN_VALUE;

    if (lastPrice <= bidPrice1) {
      return "down";
    }

    const prePrice = preTick.lastPrice;

    if (lastPrice > prePrice) {
      return "up";
    }

    if (lastPrice < prePrice) {
      return "down";
    }

    if (bidPrice1 >= preAskPrice1) {
      return "up";
    }

    if (askPrice1 <= preBidPrice1) {
      return "down";
    }

    return "none";
  } else {
    const askPrice1 = tick.orderBook.asks.price[0] ?? Number.MAX_VALUE;

    if (lastPrice >= askPrice1) {
      return "up";
    }

    const bidPrice1 = tick.orderBook.bids.price[0] ?? Number.MIN_VALUE;

    if (lastPrice <= bidPrice1) {
      return "down";
    }

    if (lastPrice > tick.preClose) {
      return "up";
    }

    if (lastPrice < tick.preClose) {
      return "down";
    }

    return "none";
  }
};

const calcTapeStatus = (
  tapeType: TapeType,
  tapeDirection: TapeDirection,
): TapeStatus => {
  if (tapeType === "open" && tapeDirection === "up") {
    return "open-long";
  }

  if (tapeType === "open" && tapeDirection === "down") {
    return "open-short";
  }

  if (tapeType === "close" && tapeDirection === "up") {
    return "close-short";
  }

  if (tapeType === "close" && tapeDirection === "down") {
    return "close-long";
  }

  if (tapeType === "turnover" && tapeDirection === "up") {
    return "turnover-long";
  }

  if (tapeType === "turnover" && tapeDirection === "down") {
    return "turnover-short";
  }

  if (tapeType === "dual-open") {
    return "dual-open";
  }

  if (tapeType === "dual-close") {
    return "dual-close";
  }

  return "invalid";
};

export const calcTapeData = (tick: TickData, preTick?: TickData): TapeData => {
  const [volumeDelta, interestDelta] = preTick
    ? [tick.volume - preTick.volume, tick.openInterest - preTick.openInterest]
    : [tick.volume, tick.openInterest - tick.preOpenInterest];

  const tapeType = calcTapeType(volumeDelta, interestDelta);
  const tapeDirection = calcTapeDirection(tick, preTick);
  const tapeStatus = calcTapeStatus(tapeType, tapeDirection);

  return {
    symbol: tick.symbol,
    date: tick.date,
    time: tick.time,
    volumeDelta: volumeDelta,
    interestDelta: interestDelta,
    type: tapeType,
    direction: tapeDirection,
    status: tapeStatus,
  };
};
