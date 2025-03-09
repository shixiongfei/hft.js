/*
 * bar.ts
 *
 * Copyright (c) 2025 Xiongfei Shi
 *
 * Author: Xiongfei Shi <xiongfei.shi(a)icloud.com>
 * License: Apache-2.0
 *
 * https://github.com/shixiongfei/hft.js
 */

import { BarData, TickData, Writeable } from "./typedef.js";
import { IBarReceiver, ITickReceiver } from "./interfaces.js";
import { calcTapeData } from "./tape.js";

export type BarInfo = Writeable<BarData>;

export class BarGenerator implements ITickReceiver {
  private readonly receivers: IBarReceiver[];
  private readonly symbol: string;
  private lastTick?: TickData;
  private bar?: BarInfo;

  constructor(symbol: string) {
    this.receivers = [];
    this.symbol = symbol;
  }

  get isWorking() {
    return this.receivers.length > 0;
  }

  addReceiver(receiver: IBarReceiver) {
    if (!this.receivers.includes(receiver)) {
      this.receivers.push(receiver);
    }
  }

  removeReceiver(receiver: IBarReceiver) {
    const index = this.receivers.indexOf(receiver);

    if (index >= 0) {
      this.receivers.splice(index, 1);
    }
  }

  onTick(tick: TickData) {
    if (tick.symbol !== this.symbol) {
      return;
    }

    const date = tick.date;
    const time = Math.floor(tick.time / 100) * 100;

    if (this.bar && (this.bar.date !== date || this.bar.time !== time)) {
      const bar = Object.freeze(this.bar);

      Object.freeze(bar.buyVolumes);
      Object.freeze(bar.sellVolumes);

      this.receivers.forEach((receiver) => receiver.onBar(bar));
      this.bar = undefined;
    }

    const tape = calcTapeData(tick, this.lastTick);

    if (tape.volumeDelta === 0) {
      return;
    }

    if (!this.bar) {
      this.bar = this._createBar(date, time, tick);
    }

    this.bar.openInterest = tick.openInterest;
    this.bar.closePrice = tick.lastPrice;

    this.bar.highPrice = Math.max(this.bar.highPrice, tick.lastPrice);
    this.bar.lowPrice = Math.min(this.bar.lowPrice, tick.lastPrice);

    this.bar.volume += tape.volumeDelta;
    this.bar.amount += tape.amountDelta;
  }

  private _createBar(date: number, time: number, tick: TickData): BarInfo {
    return {
      symbol: this.symbol,
      date: date,
      time: time,
      openInterest: tick.openInterest,
      openPrice: tick.lastPrice,
      highPrice: tick.lastPrice,
      lowPrice: tick.lastPrice,
      closePrice: tick.lastPrice,
      volume: 0,
      amount: 0,
      delta: 0,
      poc: 0,
      buyVolumes: {},
      sellVolumes: {},
    };
  }
}

export const createBarGenerator = (symbol: string) => new BarGenerator(symbol);
